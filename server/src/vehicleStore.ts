import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  componentFileSchema,
  findPackageProblems,
  modelMapSchema,
  registrySchema,
  sourceSchema,
  symptomsFileSchema,
  systemsFileSchema,
  vehicleSchema,
  type RegistryEntry,
  type VehiclePackage,
} from "@car-schematic/shared";

const serverDirectory = path.dirname(fileURLToPath(import.meta.url));
export const vehiclesRoot = path.resolve(process.env.VEHICLES_DIR ?? path.join(serverDirectory, "../../vehicles"));

const CACHE_TTL_MS = 10_000;

export class VehicleDataError extends Error {
  constructor(
    message: string,
    readonly problems: string[],
  ) {
    super(message);
  }
}

async function readJson<T>(filePath: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>): Promise<T> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    throw new VehicleDataError(`Cannot read ${path.relative(vehiclesRoot, filePath)}`, [String(error)]);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new VehicleDataError(`Invalid JSON in ${path.relative(vehiclesRoot, filePath)}`, [String(error)]);
  }
  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new VehicleDataError(
      `Schema errors in ${path.relative(vehiclesRoot, filePath)}`,
      result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    );
  }
  return result.data;
}

export async function loadRegistry(): Promise<RegistryEntry[]> {
  const registry = await readJson(path.join(vehiclesRoot, "index.json"), registrySchema);
  return registry.vehicles;
}

export function resolvePackageDirectory(entry: RegistryEntry): string {
  const directory = path.resolve(vehiclesRoot, entry.path);
  if (!directory.startsWith(vehiclesRoot + path.sep)) {
    throw new VehicleDataError(`Vehicle ${entry.id} points outside the vehicles folder`, [entry.path]);
  }
  return directory;
}

async function readPackage(directory: string): Promise<VehiclePackage> {
  const componentDirectory = path.join(directory, "components");
  const componentFiles = (await readdir(componentDirectory)).filter((name) => name.endsWith(".json")).sort();
  const hasSymptoms = (await readdir(directory)).includes("symptoms.json");
  const [vehicle, systemsFile, symptomsFile, sourcesFile, modelMap, ...componentGroups] = await Promise.all([
    readJson(path.join(directory, "vehicle.json"), vehicleSchema),
    readJson(path.join(directory, "systems.json"), systemsFileSchema),
    hasSymptoms ? readJson(path.join(directory, "symptoms.json"), symptomsFileSchema) : Promise.resolve({ symptoms: [] }),
    readJson(path.join(directory, "sources.json"), z.object({ sources: z.array(sourceSchema) })),
    readJson(path.join(directory, "model.map.json"), modelMapSchema),
    ...componentFiles.map((name) => readJson(path.join(componentDirectory, name), componentFileSchema)),
  ]);
  return {
    vehicle,
    systems: systemsFile.systems,
    assemblies: systemsFile.assemblies,
    symptoms: symptomsFile.symptoms,
    sources: sourcesFile.sources,
    modelMap,
    components: componentGroups.flatMap((group) => group.components),
  };
}

const packageCache = new Map<string, { loadedAt: number; vehiclePackage: VehiclePackage }>();

export async function loadVehiclePackage(vehicleId: string): Promise<VehiclePackage | null> {
  const cached = packageCache.get(vehicleId);
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) return cached.vehiclePackage;

  const entry = (await loadRegistry()).find((candidate) => candidate.id === vehicleId);
  if (!entry) return null;

  const vehiclePackage = await readPackage(resolvePackageDirectory(entry));
  if (vehiclePackage.vehicle.id !== entry.id) {
    throw new VehicleDataError(`vehicle.json id does not match registry id ${entry.id}`, [vehiclePackage.vehicle.id]);
  }
  const problems = findPackageProblems(vehiclePackage);
  if (problems.length > 0) throw new VehicleDataError(`Vehicle ${vehicleId} has data problems`, problems);

  packageCache.set(vehicleId, { loadedAt: Date.now(), vehiclePackage });
  return vehiclePackage;
}
