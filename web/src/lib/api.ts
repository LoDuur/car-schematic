import type { Language, RegistryEntry, VehicleConfig, VehiclePackage } from "@car-schematic/shared";

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly problems: string[] = [],
  ) {
    super(message);
  }
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new ApiError("network", "The server is not reachable.");
  }
  const body = (await response.json().catch(() => null)) as
    | (T & { error?: undefined })
    | { error: string; message?: string; problems?: string[] }
    | null;
  if (!response.ok || body === null || (typeof body === "object" && "error" in body && body.error)) {
    const failure = body as { error?: string; message?: string; problems?: string[] } | null;
    throw new ApiError(failure?.error ?? `http_${response.status}`, failure?.message ?? response.statusText, failure?.problems ?? []);
  }
  return body as T;
}

export function fetchRegistry(): Promise<{ vehicles: RegistryEntry[] }> {
  return requestJson("/api/vehicles");
}

export function fetchVehiclePackage(vehicleId: string): Promise<VehiclePackage> {
  return requestJson(`/api/vehicles/${encodeURIComponent(vehicleId)}`);
}

export function fetchAssistantStatus(): Promise<{ configured: boolean }> {
  return requestJson("/api/assistant/status");
}

export interface AssistantAction {
  type: "highlight" | "select" | "focus" | "isolate";
  componentIds: string[];
}

export interface AssistantReply {
  answer: string;
  components: { id: string; reason: string }[];
  possibleCauses: { title: string; explanation: string; componentIds: string[]; checks: string[] }[];
  actions: AssistantAction[];
  dataGaps: string[];
  safety?: string;
}

export interface AssistantRequest {
  vehicleId: string;
  config: VehicleConfig;
  language: Language;
  message: string;
  history: { role: "user" | "model"; text: string }[];
  selectedId?: string;
}

export function askAssistant(request: AssistantRequest, signal: AbortSignal): Promise<AssistantReply> {
  return requestJson("/api/assistant", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });
}
