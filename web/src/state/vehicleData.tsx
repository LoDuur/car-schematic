import { createContext, useContext, useMemo, type ReactNode } from "react";
import {
  listValidConfigs,
  resolveComponents,
  type Assembly,
  type Component,
  type Symptom,
  type VehicleConfig,
  type VehiclePackage,
  type VehicleSystem,
} from "@car-schematic/shared";

export interface VehicleData {
  vehiclePackage: VehiclePackage;
  config: VehicleConfig;
  validConfigs: VehicleConfig[];
  components: Component[];
  componentsById: Map<string, Component>;
  notFitted: Component[];
  systemsById: Map<string, VehicleSystem>;
  assembliesById: Map<string, Assembly>;
  symptomsById: Map<string, Symptom>;
}

const VehicleDataContext = createContext<VehicleData | null>(null);

export function VehicleDataProvider({
  vehiclePackage,
  config,
  children,
}: {
  vehiclePackage: VehiclePackage;
  config: VehicleConfig;
  children: ReactNode;
}) {
  const validConfigs = useMemo(() => listValidConfigs(vehiclePackage.vehicle), [vehiclePackage]);
  const value = useMemo<VehicleData>(() => {
    const components = resolveComponents(vehiclePackage, config);
    const fittedIds = new Set(components.map((component) => component.id));
    return {
      vehiclePackage,
      config,
      validConfigs,
      components,
      componentsById: new Map(components.map((component) => [component.id, component])),
      notFitted: vehiclePackage.components.filter((component) => !fittedIds.has(component.id)),
      systemsById: new Map(vehiclePackage.systems.map((system) => [system.id, system])),
      assembliesById: new Map(vehiclePackage.assemblies.map((assembly) => [assembly.id, assembly])),
      symptomsById: new Map(vehiclePackage.symptoms.map((symptom) => [symptom.id, symptom])),
    };
  }, [vehiclePackage, config, validConfigs]);
  return <VehicleDataContext.Provider value={value}>{children}</VehicleDataContext.Provider>;
}

export function useVehicleData(): VehicleData {
  const value = useContext(VehicleDataContext);
  if (!value) throw new Error("useVehicleData must be used inside VehicleDataProvider");
  return value;
}
