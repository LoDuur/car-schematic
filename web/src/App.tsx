import { useCallback, useEffect, useState } from "react";
import { isValidConfig, resolveComponents, type RegistryEntry, type VehiclePackage } from "@car-schematic/shared";
import { AssistantPanel } from "./components/AssistantPanel";
import { DetailPanel } from "./components/DetailPanel";
import { PartsSidebar } from "./components/PartsSidebar";
import { TopBar } from "./components/TopBar";
import { useText } from "./i18n/useText";
import { ApiError, fetchRegistry, fetchVehiclePackage } from "./lib/api";
import { readUrlState, writeUrlState } from "./lib/urlState";
import { useExplorer } from "./state/store";
import { VehicleDataProvider } from "./state/vehicleData";
import { Viewer } from "./viewer/Viewer";

type LoadState =
  | { status: "loading" }
  | { status: "failed"; message: string; problems: string[] }
  | { status: "ready"; registry: RegistryEntry[]; vehiclePackage: VehiclePackage };

type MobilePane = "parts" | "details";

export function App() {
  const { t, language } = useText();
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [mobilePane, setMobilePane] = useState<MobilePane>("parts");
  const vehicleId = useExplorer((state) => state.vehicleId);
  const config = useExplorer((state) => state.config);
  const selectedId = useExplorer((state) => state.selectedId);
  const openVehicle = useExplorer((state) => state.openVehicle);
  const select = useExplorer((state) => state.select);

  const load = useCallback(
    async (requestedVehicleId: string | null) => {
      setLoadState({ status: "loading" });
      try {
        const { vehicles } = await fetchRegistry();
        const urlState = readUrlState();
        const entry = vehicles.find((candidate) => candidate.id === requestedVehicleId) ?? vehicles[0];
        if (!entry) throw new ApiError("no_vehicles", "No vehicles are registered in vehicles/index.json.");
        const vehiclePackage = await fetchVehiclePackage(entry.id);
        const isUrlVehicle = urlState.vehicleId === entry.id;
        const nextConfig =
          isUrlVehicle && isValidConfig(vehiclePackage.vehicle, urlState.config) ? urlState.config : vehiclePackage.vehicle.defaultConfig;
        const fittedIds = new Set(resolveComponents(vehiclePackage, nextConfig).map((component) => component.id));
        const partId = isUrlVehicle && urlState.partId && fittedIds.has(urlState.partId) ? urlState.partId : null;
        openVehicle(entry.id, nextConfig, partId);
        setLoadState({ status: "ready", registry: vehicles, vehiclePackage });
      } catch (error) {
        setLoadState({
          status: "failed",
          message: error instanceof Error ? error.message : String(error),
          problems: error instanceof ApiError ? error.problems : [],
        });
      }
    },
    [openVehicle],
  );

  useEffect(() => {
    void load(readUrlState().vehicleId);
  }, [load]);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    if (vehicleId && config) writeUrlState({ vehicleId, config, partId: selectedId });
  }, [vehicleId, config, selectedId]);

  useEffect(() => {
    if (selectedId) setMobilePane("details");
  }, [selectedId]);

  useEffect(() => {
    const clearOnEscape = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.key === "Escape" && !target?.closest("input, textarea, select, dialog")) select(null);
    };
    window.addEventListener("keydown", clearOnEscape);
    return () => window.removeEventListener("keydown", clearOnEscape);
  }, [select]);

  if (loadState.status === "loading" || (loadState.status === "ready" && !config)) {
    return (
      <main className="app-state" aria-busy="true">
        <p>{t("loading")}…</p>
      </main>
    );
  }

  if (loadState.status === "failed") {
    return (
      <main className="app-state">
        <h1>{t("loadFailed")}</h1>
        <p>{loadState.message}</p>
        {loadState.problems.length > 0 && (
          <>
            <p>{t("dataProblems")}</p>
            <ul className="problem-list">
              {loadState.problems.map((problem) => (
                <li key={problem}>
                  <code>{problem}</code>
                </li>
              ))}
            </ul>
          </>
        )}
        <button type="button" className="button button-primary" onClick={() => void load(vehicleId)}>
          {t("retry")}
        </button>
      </main>
    );
  }

  return (
    <VehicleDataProvider vehiclePackage={loadState.vehiclePackage} config={config!}>
      <div className="app">
        <a className="skip-link" href="#parts-sidebar">
          {t("skipToParts")}
        </a>
        <TopBar registry={loadState.registry} onVehicleChange={(nextId) => void load(nextId)} />
        <main className={`workspace show-${mobilePane}`}>
          <Viewer />
          <div className="mobile-tabs" role="tablist" aria-label={t("partListLabel")}>
            <button type="button" role="tab" aria-selected={mobilePane === "parts"} onClick={() => setMobilePane("parts")}>
              {t("parts")}
            </button>
            <button type="button" role="tab" aria-selected={mobilePane === "details"} onClick={() => setMobilePane("details")}>
              {t("detailsTab")}
            </button>
          </div>
          <PartsSidebar />
          <DetailPanel />
        </main>
        <AssistantPanel key={JSON.stringify(config)} />
      </div>
    </VehicleDataProvider>
  );
}
