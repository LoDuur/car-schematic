import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { BookmarkSimple, CaretRight, Eye, EyeSlash, FrameCorners, X } from "@phosphor-icons/react";
import type { Component, LocalizedText } from "@car-schematic/shared";
import { useText } from "../i18n/useText";
import { useExplorer } from "../state/store";
import { useVehicleData } from "../state/vehicleData";
import { Localized } from "./Localized";

type SidebarTab = "parts" | "saved";

interface AssemblyGroup {
  key: string;
  name: LocalizedText | null;
  parts: Component[];
}

interface SystemGroup {
  key: string;
  name: LocalizedText;
  parts: Component[];
  assemblies: AssemblyGroup[];
}

function isAdditiveClick(event: MouseEvent): boolean {
  return event.shiftKey || event.metaKey || event.ctrlKey;
}

function PartRow({ component }: { component: Component }) {
  const { t, local } = useText();
  const isPrimary = useExplorer((state) => state.selectedId === component.id);
  const isSelected = useExplorer((state) => state.selectedIds.includes(component.id));
  const isHidden = useExplorer((state) => state.hiddenIds.includes(component.id));
  const isolation = useExplorer((state) => state.isolatedIds);
  const isHighlighted = useExplorer((state) => state.highlightIds.includes(component.id));
  const select = useExplorer((state) => state.select);
  const toggleHidden = useExplorer((state) => state.toggleHidden);
  const isInIsolation = isolation?.includes(component.id) ?? false;
  const isDimmed = isolation !== null && !isInIsolation;

  const className = [
    "part-row",
    isSelected && "is-selected",
    isPrimary && "is-primary",
    isHighlighted && "is-highlighted",
    isHidden && "is-hidden",
    isDimmed && "is-dimmed",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <li className={className} data-component-id={component.id}>
      <button
        type="button"
        className="part-name"
        aria-pressed={isSelected}
        onClick={(event) => select(component.id, { focus: !isAdditiveClick(event), additive: isAdditiveClick(event) })}
      >
        <Localized text={component.name} />
      </button>
      {isInIsolation && (
        <span className="part-flag" title={t("inIsolation")}>
          <FrameCorners weight="bold" aria-hidden="true" />
          <span className="visually-hidden">{t("inIsolation")}</span>
        </span>
      )}
      <button
        type="button"
        className="icon-button part-visibility"
        onClick={() => toggleHidden(component.id)}
        aria-pressed={isHidden}
        aria-label={`${isHidden ? t("showPart") : t("hidePart")}: ${local(component.name).text}`}
      >
        {isHidden ? <EyeSlash weight="bold" aria-hidden="true" /> : <Eye weight="bold" aria-hidden="true" />}
      </button>
    </li>
  );
}

function GroupHeader({
  level,
  name,
  parts,
  isExpanded,
  onToggle,
}: {
  level: "system" | "assembly";
  name: LocalizedText;
  parts: Component[];
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const { t, local } = useText();
  const hiddenIds = useExplorer((state) => state.hiddenIds);
  const setHidden = useExplorer((state) => state.setHidden);
  const isolate = useExplorer((state) => state.isolate);
  const ids = parts.map((part) => part.id);
  const hiddenCount = ids.filter((id) => hiddenIds.includes(id)).length;
  const isAllHidden = hiddenCount === ids.length;
  const label = local(name).text;

  return (
    <div className={`group-header group-${level}`}>
      <button type="button" className="group-toggle" aria-expanded={isExpanded} onClick={onToggle}>
        <CaretRight weight="bold" aria-hidden="true" className="group-caret" />
        <span className="group-name">
          <Localized text={name} />
        </span>
        <span className="tab-count">{hiddenCount > 0 ? `${ids.length - hiddenCount}/${ids.length}` : ids.length}</span>
      </button>
      <button type="button" className="icon-button group-action" onClick={() => isolate(ids, { focus: true })} aria-label={`${t("isolate")}: ${label}`} title={t("isolate")}>
        <FrameCorners weight="bold" aria-hidden="true" />
      </button>
      <button
        type="button"
        className="icon-button group-action"
        onClick={() => setHidden(ids, !isAllHidden)}
        aria-pressed={isAllHidden}
        aria-label={`${isAllHidden ? t("showPart") : t("hidePart")}: ${label}`}
        title={isAllHidden ? t("showPart") : t("hidePart")}
      >
        {isAllHidden ? <EyeSlash weight="bold" aria-hidden="true" /> : <Eye weight="bold" aria-hidden="true" />}
      </button>
    </div>
  );
}

function SelectionBar() {
  const { t } = useText();
  const selectedIds = useExplorer((state) => state.selectedIds);
  const isolate = useExplorer((state) => state.isolate);
  const setHidden = useExplorer((state) => state.setHidden);
  const focusOn = useExplorer((state) => state.focusOn);
  const select = useExplorer((state) => state.select);
  if (selectedIds.length < 2) return null;
  return (
    <div className="selection-bar" role="status">
      <span>
        {selectedIds.length} {t("selectedCount")}
      </span>
      <button type="button" className="button button-quiet" onClick={() => focusOn(selectedIds)}>
        {t("focus")}
      </button>
      <button type="button" className="button button-quiet" onClick={() => isolate(selectedIds, { focus: true })}>
        {t("isolate")}
      </button>
      <button type="button" className="button button-quiet" onClick={() => setHidden(selectedIds, true)}>
        {t("hide")}
      </button>
      <button type="button" className="icon-button" onClick={() => select(null)} aria-label={t("clearSelection")}>
        <X weight="bold" aria-hidden="true" />
      </button>
    </div>
  );
}

export function PartsSidebar() {
  const { t } = useText();
  const { vehiclePackage, components, componentsById, notFitted, assembliesById } = useVehicleData();
  const vehicleId = useExplorer((state) => state.vehicleId);
  const bookmarks = useExplorer((state) => (vehicleId ? state.bookmarks[vehicleId] : undefined));
  const selectedId = useExplorer((state) => state.selectedId);
  const isolatedIds = useExplorer((state) => state.isolatedIds);
  const isolate = useExplorer((state) => state.isolate);
  const select = useExplorer((state) => state.select);
  const [tab, setTab] = useState<SidebarTab>("parts");
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const listRef = useRef<HTMLDivElement>(null);

  const groups = useMemo<SystemGroup[]>(
    () =>
      vehiclePackage.systems
        .map((system) => {
          const parts = components.filter((component) => component.systemId === system.id);
          const assemblyIds = [...new Set(parts.map((part) => part.assemblyId ?? ""))];
          const assemblies = assemblyIds.map((assemblyId) => ({
            key: `${system.id}/${assemblyId}`,
            name: assemblyId ? (assembliesById.get(assemblyId)?.name ?? null) : null,
            parts: parts.filter((part) => (part.assemblyId ?? "") === assemblyId),
          }));
          return { key: system.id, name: system.name, parts, assemblies };
        })
        .filter((group) => group.parts.length > 0),
    [vehiclePackage.systems, components, assembliesById],
  );

  useEffect(() => {
    if (!selectedId) return;
    const component = componentsById.get(selectedId);
    if (!component) return;
    setTab("parts");
    setCollapsed((current) => {
      const next = new Set(current);
      next.delete(component.systemId);
      next.delete(`${component.systemId}/${component.assemblyId ?? ""}`);
      return next.size === current.size ? current : next;
    });
    requestAnimationFrame(() => {
      listRef.current?.querySelector(`[data-component-id="${selectedId}"]`)?.scrollIntoView({ block: "nearest" });
    });
  }, [selectedId, componentsById]);

  const toggle = (key: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const isAllCollapsed = groups.every((group) => collapsed.has(group.key));
  const savedIds = bookmarks ?? [];

  return (
    <aside className="sidebar" id="parts-sidebar" tabIndex={-1} aria-labelledby="parts-sidebar-title">
      <h2 id="parts-sidebar-title" className="visually-hidden">
        {t("partListLabel")}
      </h2>
      <div className="tabs" role="tablist" aria-label={t("partListLabel")}>
        <button type="button" role="tab" id="tab-parts" aria-controls="panel-parts" aria-selected={tab === "parts"} className="tab" onClick={() => setTab("parts")}>
          {t("parts")} <span className="tab-count">{components.length}</span>
        </button>
        <button type="button" role="tab" id="tab-saved" aria-controls="panel-saved" aria-selected={tab === "saved"} className="tab" onClick={() => setTab("saved")}>
          {t("saved")} <span className="tab-count">{savedIds.length}</span>
        </button>
      </div>

      {tab === "parts" && (
        <div role="tabpanel" id="panel-parts" aria-labelledby="tab-parts" className="sidebar-scroll" ref={listRef}>
          <div className="sidebar-tools">
            <button type="button" className="text-button" onClick={() => setCollapsed(isAllCollapsed ? new Set() : new Set(groups.map((group) => group.key)))}>
              {isAllCollapsed ? t("expandAll") : t("collapseAll")}
            </button>
            <span className="sidebar-hint">{t("multiSelectHint")}</span>
          </div>
          {isolatedIds && (
            <div className="isolation-bar" role="status">
              <FrameCorners weight="bold" aria-hidden="true" />
              <span>
                {t("isolationActive")} ({isolatedIds.length})
              </span>
              <button type="button" className="text-button" onClick={() => isolate(null)}>
                {t("exitIsolate")}
              </button>
            </div>
          )}
          <SelectionBar />
          <ul className="tree">
            {groups.map((group) => {
              const isSystemOpen = !collapsed.has(group.key);
              return (
                <li key={group.key} className="tree-system">
                  <GroupHeader level="system" name={group.name} parts={group.parts} isExpanded={isSystemOpen} onToggle={() => toggle(group.key)} />
                  {isSystemOpen && (
                    <ul className="tree-children">
                      {group.assemblies.map((assembly) => {
                        if (!assembly.name) {
                          return (
                            <li key={assembly.key}>
                              <ul className="part-list">
                                {assembly.parts.map((part) => (
                                  <PartRow key={part.id} component={part} />
                                ))}
                              </ul>
                            </li>
                          );
                        }
                        const isAssemblyOpen = !collapsed.has(assembly.key);
                        return (
                          <li key={assembly.key} className="tree-assembly">
                            <GroupHeader level="assembly" name={assembly.name} parts={assembly.parts} isExpanded={isAssemblyOpen} onToggle={() => toggle(assembly.key)} />
                            {isAssemblyOpen && (
                              <ul className="part-list">
                                {assembly.parts.map((part) => (
                                  <PartRow key={part.id} component={part} />
                                ))}
                              </ul>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
          {notFitted.length > 0 && (
            <details className="not-fitted">
              <summary>
                {t("notFitted")} <span className="tab-count">{notFitted.length}</span>
              </summary>
              <ul className="part-list part-list-muted">
                {notFitted.map((component) => (
                  <li key={component.id} className="part-row">
                    <span className="part-name">
                      <Localized text={component.name} />
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {tab === "saved" && (
        <div role="tabpanel" id="panel-saved" aria-labelledby="tab-saved" className="sidebar-scroll">
          {savedIds.length === 0 ? (
            <p className="empty-note">
              <BookmarkSimple weight="bold" aria-hidden="true" /> {t("savedEmpty")}
            </p>
          ) : (
            <ul className="part-list">
              {savedIds.map((componentId) => {
                const component = componentsById.get(componentId);
                const original = vehiclePackage.components.find((candidate) => candidate.id === componentId);
                if (!component) {
                  return original ? (
                    <li key={componentId} className="part-row is-unavailable">
                      <span className="part-name">
                        <Localized text={original.name} />
                      </span>
                      <span className="part-meta">{t("notFitted")}</span>
                    </li>
                  ) : null;
                }
                return (
                  <li key={componentId} className="part-row">
                    <button type="button" className="part-name" onClick={() => select(componentId, { focus: true })}>
                      <Localized text={component.name} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </aside>
  );
}
