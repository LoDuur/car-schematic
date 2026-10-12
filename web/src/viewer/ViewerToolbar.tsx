import { useId } from "react";
import { Eye, Sparkle } from "@phosphor-icons/react";
import { useText } from "../i18n/useText";
import type { MessageKey } from "../i18n/messages";
import { useExplorer, type CameraPreset, type ViewMode } from "../state/store";

const VIEW_MODES: { mode: ViewMode; label: MessageKey }[] = [
  { mode: "normal", label: "viewNormal" },
  { mode: "xray", label: "viewXray" },
  { mode: "exploded", label: "viewExploded" },
];

const CAMERA_PRESETS: { preset: CameraPreset; label: MessageKey }[] = [
  { preset: "isometric", label: "cameraIsometric" },
  { preset: "front", label: "cameraFront" },
  { preset: "rear", label: "cameraRear" },
  { preset: "left", label: "cameraLeft" },
  { preset: "right", label: "cameraRight" },
  { preset: "top", label: "cameraTop" },
];

export function ViewerToolbar() {
  const { t } = useText();
  const sliderId = useId();
  const viewMode = useExplorer((state) => state.viewMode);
  const setViewMode = useExplorer((state) => state.setViewMode);
  const explode = useExplorer((state) => state.explode);
  const setExplode = useExplorer((state) => state.setExplode);
  const hiddenCount = useExplorer((state) => state.hiddenIds.length);
  const isIsolated = useExplorer((state) => state.isolatedIds !== null);
  const hasHighlights = useExplorer((state) => state.highlightIds.length > 0);
  const showAll = useExplorer((state) => state.showAll);
  const clearHighlights = useExplorer((state) => state.clearHighlights);
  const requestCamera = useExplorer((state) => state.requestCamera);

  return (
    <div className="viewer-toolbar">
      <div className="segmented" role="radiogroup" aria-label={t("viewMode")}>
        {VIEW_MODES.map(({ mode, label }) => (
          <button key={mode} type="button" role="radio" aria-checked={viewMode === mode} onClick={() => setViewMode(mode)}>
            {t(label)}
          </button>
        ))}
      </div>
      {viewMode === "exploded" && (
        <label className="explode-control" htmlFor={sliderId}>
          <span>{t("explodeDistance")}</span>
          <input
            id={sliderId}
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(explode * 100)}
            onChange={(event) => setExplode(Number(event.target.value) / 100)}
            aria-valuetext={`${Math.round(explode * 100)}%`}
          />
        </label>
      )}
      <div className="segmented" role="group" aria-label={t("cameraViews")}>
        {CAMERA_PRESETS.map(({ preset, label }) => (
          <button key={preset} type="button" onClick={() => requestCamera(preset)}>
            {t(label)}
          </button>
        ))}
      </div>
      {(hiddenCount > 0 || isIsolated) && (
        <button type="button" className="button button-quiet" onClick={showAll}>
          <Eye weight="bold" aria-hidden="true" />
          {t("showAll")}
          {hiddenCount > 0 && <span className="tab-count">{hiddenCount}</span>}
        </button>
      )}
      {hasHighlights && (
        <button type="button" className="button button-quiet" onClick={clearHighlights}>
          <Sparkle weight="bold" aria-hidden="true" />
          {t("clearHighlights")}
        </button>
      )}
    </div>
  );
}
