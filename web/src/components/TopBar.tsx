import { LANGUAGES, type RegistryEntry } from "@car-schematic/shared";
import { useText } from "../i18n/useText";
import { useExplorer } from "../state/store";
import { useVehicleData } from "../state/vehicleData";
import { ConfigButton } from "./ConfigDialog";
import { Localized } from "./Localized";
import { SearchBox } from "./SearchBox";

interface TopBarProps {
  registry: RegistryEntry[];
  onVehicleChange: (vehicleId: string) => void;
}

export function TopBar({ registry, onVehicleChange }: TopBarProps) {
  const { t, language } = useText();
  const { vehiclePackage } = useVehicleData();
  const setLanguage = useExplorer((state) => state.setLanguage);

  return (
    <header className="topbar">
      <div className="topbar-vehicle">
        <h1 className="vehicle-title">
          <Localized text={vehiclePackage.vehicle.name} />
        </h1>
        <ConfigButton registry={registry} onVehicleChange={onVehicleChange} />
      </div>
      <SearchBox />
      <div className="language-switch" role="group" aria-label={t("language")}>
        {LANGUAGES.map((code) => (
          <button key={code} type="button" lang={code} aria-pressed={language === code} onClick={() => setLanguage(code)}>
            {code.toUpperCase()}
          </button>
        ))}
      </div>
    </header>
  );
}
