import { useEffect, useMemo, useRef, useState } from "react";
import { SlidersHorizontal, X } from "@phosphor-icons/react";
import { availableOptionIds, chooseOption, isOptionCompatible, localize, type RegistryEntry } from "@car-schematic/shared";
import { useText } from "../i18n/useText";
import { useExplorer } from "../state/store";
import { useVehicleData } from "../state/vehicleData";
import { Localized } from "./Localized";

const DEFAULT_SUMMARY_AXIS_COUNT = 3;

interface VehiclePickerProps {
  registry: RegistryEntry[];
  onVehicleChange: (vehicleId: string) => void;
}

export function ConfigButton(props: VehiclePickerProps) {
  const { t, language } = useText();
  const { vehiclePackage, config } = useVehicleData();
  const [isOpen, setIsOpen] = useState(false);
  const { axes, summaryAxes } = vehiclePackage.vehicle;
  const shownAxes = summaryAxes.length > 0 ? axes.filter((axis) => summaryAxes.includes(axis.id)) : axes.slice(0, DEFAULT_SUMMARY_AXIS_COUNT);
  const summary = shownAxes
    .map((axis) => axis.options.find((option) => option.id === config[axis.id]))
    .filter((option) => option !== undefined)
    .map((option) => localize(option.label, language).text)
    .join(", ");

  return (
    <>
      <button type="button" className="config-button" onClick={() => setIsOpen(true)} aria-haspopup="dialog">
        <SlidersHorizontal weight="bold" aria-hidden="true" />
        <span className="visually-hidden">{t("configure")}: </span>
        <span className="config-summary" translate="no">
          {summary}
        </span>
      </button>
      {isOpen && <ConfigDialog {...props} onClose={() => setIsOpen(false)} />}
    </>
  );
}

function VehiclePicker({ registry, onVehicleChange, onClose }: VehiclePickerProps & { onClose: () => void }) {
  const { t } = useText();
  const { vehiclePackage } = useVehicleData();
  const current = registry.find((entry) => entry.id === vehiclePackage.vehicle.id);
  const [make, setMake] = useState(current?.make ?? "");
  const [model, setModel] = useState(current?.model ?? "");
  const makes = [...new Set(registry.map((entry) => entry.make))];
  const models = [...new Set(registry.filter((entry) => entry.make === make).map((entry) => entry.model))];
  const generations = registry.filter((entry) => entry.make === make && entry.model === model);

  const chooseGeneration = (vehicleId: string) => {
    if (vehicleId !== vehiclePackage.vehicle.id) {
      onVehicleChange(vehicleId);
      onClose();
    }
  };

  return (
    <fieldset className="vehicle-picker">
      <legend>{t("vehicle")}</legend>
      <div className="config-grid">
        <div className="config-field">
          <label htmlFor="vehicle-make">{t("make")}</label>
          <select
            id="vehicle-make"
            value={make}
            disabled={makes.length < 2}
            onChange={(event) => {
              const nextMake = event.target.value;
              const firstModel = registry.find((entry) => entry.make === nextMake)?.model ?? "";
              setMake(nextMake);
              setModel(firstModel);
            }}
          >
            {makes.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <div className="config-field">
          <label htmlFor="vehicle-model">{t("vehicleModel")}</label>
          <select id="vehicle-model" value={model} disabled={models.length < 2} onChange={(event) => setModel(event.target.value)}>
            {models.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <div className="config-field">
          <label htmlFor="vehicle-generation">{t("generation")}</label>
          <select
            id="vehicle-generation"
            value={generations.some((entry) => entry.id === vehiclePackage.vehicle.id) ? vehiclePackage.vehicle.id : ""}
            disabled={generations.length === 0 || (generations.length === 1 && generations[0]?.id === vehiclePackage.vehicle.id)}
            onChange={(event) => chooseGeneration(event.target.value)}
          >
            {!generations.some((entry) => entry.id === vehiclePackage.vehicle.id) && <option value="">{t("chooseGeneration")}</option>}
            {generations.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.generation}
              </option>
            ))}
          </select>
        </div>
      </div>
    </fieldset>
  );
}

function ConfigDialog({ registry, onVehicleChange, onClose }: VehiclePickerProps & { onClose: () => void }) {
  const { t, local } = useText();
  const { vehiclePackage, config, validConfigs } = useVehicleData();
  const setConfig = useExplorer((state) => state.setConfig);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [changedAxisIds, setChangedAxisIds] = useState<string[]>([]);
  const { axes } = vehiclePackage.vehicle;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const availability = useMemo(() => new Map(axes.map((axis) => [axis.id, availableOptionIds(validConfigs, axis.id)])), [axes, validConfigs]);

  const changeOption = (axisId: string, optionId: string) => {
    const next = chooseOption(validConfigs, axes, config, axisId, optionId);
    if (!next) return;
    setChangedAxisIds(axes.filter((axis) => axis.id !== axisId && next[axis.id] !== config[axis.id]).map((axis) => axis.id));
    setConfig(next);
  };

  const selectedNotes = axes.flatMap((axis) => {
    const option = axis.options.find((candidate) => candidate.id === config[axis.id]);
    return option?.note && typeof option.note !== "string" ? [{ axisId: axis.id, note: option.note }] : [];
  });

  return (
    <dialog ref={dialogRef} className="config-dialog" aria-labelledby="config-title" onClose={onClose} onCancel={onClose}>
      <header className="dialog-header">
        <h2 id="config-title">{t("configureTitle")}</h2>
        <button type="button" className="icon-button" onClick={onClose} aria-label={t("close")}>
          <X weight="bold" aria-hidden="true" />
        </button>
      </header>
      <p className="dialog-hint">{t("configureHint")}</p>
      <VehiclePicker registry={registry} onVehicleChange={onVehicleChange} onClose={onClose} />
      <fieldset className="vehicle-picker">
        <legend>{t("configure")}</legend>
        <div className="config-grid">
          {axes.map((axis) => {
            const available = availability.get(axis.id);
            const selectId = `axis-${axis.id}`;
            return (
              <div key={axis.id} className={`config-field${changedAxisIds.includes(axis.id) ? " is-changed" : ""}`}>
                <label htmlFor={selectId}>
                  <Localized text={axis.label} />
                </label>
                <select id={selectId} name={axis.id} value={config[axis.id] ?? ""} onChange={(event) => changeOption(axis.id, event.target.value)}>
                  {[true, false].map((isCompatibleGroup) => {
                    const groupOptions = axis.options.filter(
                      (option) => available?.has(option.id) && isOptionCompatible(validConfigs, config, axis.id, option.id) === isCompatibleGroup,
                    );
                    if (groupOptions.length === 0) return null;
                    return (
                      <optgroup key={String(isCompatibleGroup)} label={isCompatibleGroup ? t("fitsSelection") : t("changesOtherOptions")}>
                        {groupOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {local(option.label).text}
                            {option.note && typeof option.note === "string" ? ` (${option.note})` : ""}
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                </select>
              </div>
            );
          })}
        </div>
      </fieldset>
      <div aria-live="polite">
        {changedAxisIds.length > 0 && (
          <p className="config-notice">
            {t("alsoChanged")}{" "}
            {changedAxisIds
              .map((axisId) => {
                const axis = axes.find((candidate) => candidate.id === axisId)!;
                const option = axis.options.find((candidate) => candidate.id === config[axisId]);
                return `${local(axis.label).text} ${option ? local(option.label).text : ""}`;
              })
              .join("; ")}
          </p>
        )}
      </div>
      {selectedNotes.map(({ axisId, note }) => (
        <p key={axisId} className="config-note">
          <Localized text={note} />
        </p>
      ))}
      <footer className="dialog-footer">
        <button type="button" className="button button-primary" onClick={onClose}>
          {t("done")}
        </button>
      </footer>
    </dialog>
  );
}
