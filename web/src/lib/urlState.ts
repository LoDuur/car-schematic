import type { VehicleConfig } from "@car-schematic/shared";

const CONFIG_PREFIX = "c.";

export interface UrlState {
  vehicleId: string | null;
  config: VehicleConfig;
  partId: string | null;
}

export function readUrlState(): UrlState {
  const params = new URLSearchParams(window.location.search);
  const config: VehicleConfig = {};
  params.forEach((value, key) => {
    if (key.startsWith(CONFIG_PREFIX)) config[key.slice(CONFIG_PREFIX.length)] = value;
  });
  return { vehicleId: params.get("vehicle"), config, partId: params.get("part") };
}

export function writeUrlState(state: UrlState): void {
  const params = new URLSearchParams();
  if (state.vehicleId) params.set("vehicle", state.vehicleId);
  Object.entries(state.config).forEach(([axis, value]) => params.set(`${CONFIG_PREFIX}${axis}`, value));
  if (state.partId) params.set("part", state.partId);
  const next = `${window.location.pathname}?${params.toString()}`;
  if (next !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(null, "", next);
}
