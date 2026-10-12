import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const vehicleDirectory = process.argv[2];
if (!vehicleDirectory) {
  console.error("Usage: node sync_model_map.mjs <vehicle directory>");
  process.exit(1);
}

const readJson = (file) => JSON.parse(readFileSync(path.join(vehicleDirectory, file), "utf8"));
const manifest = readJson("model.build.json");
const modelMap = readJson("model.map.json");
const componentIds = readdirSync(path.join(vehicleDirectory, "components"))
  .filter((file) => file.endsWith(".json"))
  .flatMap((file) => readJson(path.join("components", file)).components.map((component) => component.id));

modelMap.glb = { ...modelMap.glb, referenceConfig: manifest.referenceConfig, description: `${manifest.referenceDescription} ${manifest.layoutNote}` };
const unmappedMeshes = [];
for (const meshName of Object.keys(manifest.parts)) {
  if (meshName.startsWith("body__")) continue;
  if (!componentIds.includes(meshName)) {
    unmappedMeshes.push(meshName);
    continue;
  }
  const entry = modelMap.parts[meshName] ?? { meshes: [], shapes: [], placementStatus: "approximate" };
  entry.meshes = [...new Set([...(entry.meshes ?? []), meshName])];
  modelMap.parts[meshName] = entry;
}
const componentsWithoutGeometry = componentIds.filter((id) => !(modelMap.parts[id]?.meshes?.length || modelMap.parts[id]?.shapes?.length));

writeFileSync(path.join(vehicleDirectory, "model.map.json"), JSON.stringify(modelMap, null, 2) + "\n");
console.log(`model map synced: ${Object.keys(manifest.parts).length} meshes, ${componentIds.length} components`);
if (unmappedMeshes.length > 0) console.warn(`meshes without a component: ${unmappedMeshes.join(", ")}`);
if (componentsWithoutGeometry.length > 0) console.warn(`components without geometry: ${componentsWithoutGeometry.join(", ")}`);
process.exitCode = unmappedMeshes.length > 0 ? 1 : 0;
