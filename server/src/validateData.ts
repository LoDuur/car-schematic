import { VehicleDataError, loadRegistry, loadVehiclePackage } from "./vehicleStore";

let failed = false;
for (const entry of await loadRegistry()) {
  try {
    const vehiclePackage = await loadVehiclePackage(entry.id);
    console.log(`${entry.id}: ok, ${vehiclePackage?.components.length ?? 0} components`);
  } catch (error) {
    failed = true;
    if (error instanceof VehicleDataError) {
      console.error(`${entry.id}: ${error.message}`);
      error.problems.forEach((problem) => console.error(`  - ${problem}`));
    } else {
      console.error(`${entry.id}:`, error);
    }
  }
}
process.exitCode = failed ? 1 : 0;
