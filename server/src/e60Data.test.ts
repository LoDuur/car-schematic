import { describe, expect, it } from "vitest";
import {
  findPackageProblems,
  isValidConfig,
  listValidConfigs,
  localize,
  resolveComponents,
  type VehicleConfig,
} from "@car-schematic/shared";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadVehiclePackage, vehiclesRoot } from "./vehicleStore";

const vehiclePackage = (await loadVehiclePackage("bmw-e60"))!;
const buildManifest = JSON.parse(await readFile(path.join(vehiclesRoot, "bmw/e60/model.build.json"), "utf8")) as {
  parts: Record<string, unknown>;
};

function config(overrides: VehicleConfig): VehicleConfig {
  return { ...vehiclePackage.vehicle.defaultConfig, ...overrides };
}

function resolvedIds(selected: VehicleConfig): Set<string> {
  return new Set(resolveComponents(vehiclePackage, selected).map((component) => component.id));
}

describe("BMW E60 package", () => {
  it("loads without data problems", () => {
    expect(findPackageProblems(vehiclePackage)).toEqual([]);
  });

  it("rejects combinations that were never built", () => {
    expect(isValidConfig(vehiclePackage.vehicle, config({ model: "m5", engine: "S85B50", year: "2003" }))).toBe(false);
    expect(isValidConfig(vehiclePackage.vehicle, config({ model: "525i", engine: "N52B25", fuel: "diesel" }))).toBe(false);
    expect(isValidConfig(vehiclePackage.vehicle, config({ body: "touring", year: "2003" }))).toBe(false);
  });

  it("accepts a 2009 535d xDrive Touring automatic", () => {
    const touring = config({ year: "2009", body: "touring", model: "535d", engine: "M57D30TU2TOP", fuel: "diesel", drivetrain: "xdrive" });
    expect(isValidConfig(vehiclePackage.vehicle, touring)).toBe(true);
  });

  it("shows glow plugs and hides spark plugs for diesels", () => {
    const ids = resolvedIds(config({ year: "2008", model: "520d", engine: "N47D20", fuel: "diesel" }));
    expect(ids.has("glow-plugs")).toBe(true);
    expect(ids.has("spark-plugs")).toBe(false);
    expect(ids.has("turbocharger")).toBe(true);
  });

  it("shows xDrive parts only for xDrive", () => {
    expect(resolvedIds(config({})).has("transfer-case")).toBe(false);
    expect(resolvedIds(config({ drivetrain: "xdrive" })).has("transfer-case")).toBe(true);
  });

  it("drops relations to parts that do not exist in the configuration", () => {
    const portInjection = resolveComponents(vehiclePackage, config({}));
    const fuelLines = portInjection.find((component) => component.id === "fuel-lines")!;
    expect(fuelLines.relations.map((relation) => relation.target)).toEqual(["fuel-injectors"]);
  });

  it("has a named 3D mesh for every part fitted to the modelled reference configuration", () => {
    const referenceConfig = vehiclePackage.modelMap.glb!.referenceConfig!;
    const meshNames = new Set(Object.keys(buildManifest.parts));
    const unmodelled = resolveComponents(vehiclePackage, referenceConfig)
      .map((component) => component.id)
      .filter((id) => !(vehiclePackage.modelMap.parts[id]?.meshes ?? []).some((name) => meshNames.has(name)));
    expect(isValidConfig(vehiclePackage.vehicle, referenceConfig)).toBe(true);
    expect(unmodelled).toEqual([]);
  });

  it("names every GLB part after a component or the body", () => {
    const componentIds = new Set(vehiclePackage.components.map((component) => component.id));
    const unknown = Object.keys(buildManifest.parts).filter((name) => !componentIds.has(name) && !name.startsWith("body__"));
    expect(unknown).toEqual([]);
  });

  it("picks the cited output for the exact model, engine and year", () => {
    const engine = resolveComponents(vehiclePackage, config({}))
      .find((component) => component.id === "engine-block")!;
    const power = engine.specs.filter((spec) => spec.key === "power");
    expect(power.map((spec) => spec.value)).toEqual(["160 kW (218 PS)"]);
    expect(power[0]!.status).toBe("verified");
  });

  it("gives every valid configuration an engine output", () => {
    for (const valid of listValidConfigs(vehiclePackage.vehicle)) {
      const engine = resolveComponents(vehiclePackage, valid).find((component) => component.id === "engine-block")!;
      expect(engine.specs.some((spec) => spec.key === "power"), JSON.stringify(valid)).toBe(true);
    }
  });

  it("has Latvian and Russian names for every component", () => {
    for (const component of vehiclePackage.components) {
      expect(localize(component.name, "lv").isFallback, component.id).toBe(false);
      expect(localize(component.name, "ru").isFallback, component.id).toBe(false);
    }
  });

  it("places every component in an assembly of its own system", () => {
    const assemblies = new Map(vehiclePackage.assemblies.map((assembly) => [assembly.id, assembly]));
    for (const component of vehiclePackage.components) {
      expect(assemblies.get(component.assemblyId ?? "")?.systemId, component.id).toBe(component.systemId);
    }
  });

  it("detects a symptom link to an unknown symptom", () => {
    const broken = structuredClone(vehiclePackage);
    broken.components[0]!.symptomIds = ["made-up-symptom"];
    expect(findPackageProblems(broken)).toContain(`component ${broken.components[0]!.id}: unknown symptom "made-up-symptom"`);
  });

  it("detects a relation to an unknown component", () => {
    const broken = structuredClone(vehiclePackage);
    broken.components[0]!.relations.push({ type: "connects", target: "flux-capacitor" });
    expect(findPackageProblems(broken)).toContain(`component ${broken.components[0]!.id}: relation to unknown "flux-capacitor"`);
  });
});
