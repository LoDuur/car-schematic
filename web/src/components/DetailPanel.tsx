import { useEffect, useMemo } from "react";
import { ArrowSquareOut, BookmarkSimple, Crosshair, EyeSlash, FrameCorners, Graph, X } from "@phosphor-icons/react";
import { findIncomingRelations, RELATION_TYPES, type Component, type RelationType, type Source } from "@car-schematic/shared";
import { describePredicate } from "../lib/describePredicate";
import { useText } from "../i18n/useText";
import type { MessageKey } from "../i18n/messages";
import { useExplorer } from "../state/store";
import { useVehicleData } from "../state/vehicleData";
import { Localized } from "./Localized";
import { StatusBadge } from "./StatusBadge";

const DOC_KIND_KEYS = { specification: "docSpecification", maintenance: "docMaintenance", repair: "docRepair" } as const;

function SourceLinks({ sources }: { sources: Source[] }) {
  const { t } = useText();
  if (sources.length === 0) return null;
  return (
    <section className="detail-section">
      <h3>{t("sources")}</h3>
      <ul className="source-list">
        {sources.map((source) => (
          <li key={source.id}>
            {source.url ? (
              <a href={source.url} target="_blank" rel="noopener noreferrer">
                {source.title}, {source.publisher}
                <ArrowSquareOut weight="bold" aria-hidden="true" />
              </a>
            ) : (
              `${source.title}, ${source.publisher}`
            )}
            {source.note && <p className="source-note">{source.note}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function VehicleOverview() {
  const { t, local } = useText();
  const { vehiclePackage, components, config } = useVehicleData();
  const { vehicle, sources } = vehiclePackage;
  const { glb } = vehiclePackage.modelMap;
  const differingAxes = glb?.referenceConfig ? vehicle.axes.filter((axis) => glb.referenceConfig?.[axis.id] !== config[axis.id]) : [];
  const knownFacts = vehicle.facts.filter((fact) => fact.status !== "missing");
  const gaps = vehicle.facts.filter((fact) => fact.status === "missing");
  const citedSources = sources.filter((source) => vehicle.facts.some((fact) => fact.sourceId === source.id));

  return (
    <div className="detail">
      <header className="detail-header">
        <p className="detail-kicker">{t("overview")}</p>
        <h2 className="detail-title">
          <Localized text={vehicle.name} />
        </h2>
        <p className="detail-lead">
          <Localized text={vehicle.summary} />
        </p>
        <p className="detail-meta">
          {components.length} {t("componentsInConfig")}
        </p>
      </header>
      {knownFacts.length > 0 && (
        <section className="detail-section">
          <h3>{t("vehicleFacts")}</h3>
          <table className="spec-table">
            <tbody>
              {knownFacts.map((fact, index) => (
                <tr key={index}>
                  <th scope="row">
                    <Localized text={fact.label} />
                  </th>
                  <td className="spec-value">
                    {fact.value} {fact.unit}
                  </td>
                  <td>
                    <StatusBadge status={fact.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {gaps.length > 0 && (
        <section className="detail-section">
          <h3>{t("dataGaps")}</h3>
          <p className="section-hint">{t("dataGapsHint")}</p>
          <ul className="gap-list">
            {gaps.map((fact, index) => (
              <li key={index}>
                <Localized text={fact.label} />
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="detail-section">
        <h3>{t("model3d")}</h3>
        {glb ? (
          <>
            <p>
              {glb.sourceUrl ? (
                <a href={glb.sourceUrl} target="_blank" rel="noopener noreferrer">
                  {glb.title}
                  <ArrowSquareOut weight="bold" aria-hidden="true" />
                </a>
              ) : (
                glb.title
              )}{" "}
              {t("model3dBy")} {glb.author}, {glb.license}
            </p>
            {glb.referenceConfig && (
              <p className="section-hint">
                {t("model3dReference")}:{" "}
                <span translate="no">
                  {vehicle.axes
                    .map((axis) => axis.options.find((option) => option.id === glb.referenceConfig?.[axis.id]))
                    .filter((option) => option !== undefined)
                    .map((option) => local(option.label).text)
                    .join(", ")}
                </span>
              </p>
            )}
            {differingAxes.length > 0 && (
              <p className="notice notice-warning">
                {t("model3dDiffers")}
                {differingAxes.map((axis) => local(axis.label).text).join(", ")}. {t("model3dDiffersHint")}
              </p>
            )}
            {glb.description && <p className="section-hint">{glb.description}</p>}
          </>
        ) : (
          <p className="section-hint">{t("model3dPlaceholder")}</p>
        )}
      </section>
      <SourceLinks sources={citedSources} />
    </div>
  );
}

function ComponentDetails({ component }: { component: Component }) {
  const { t, local, language } = useText();
  const { vehiclePackage, components, componentsById, systemsById, assembliesById, symptomsById } = useVehicleData();
  const vehicleId = useExplorer((state) => state.vehicleId);
  const isBookmarked = useExplorer((state) => (vehicleId ? (state.bookmarks[vehicleId] ?? []).includes(component.id) : false));
  const isolatedIds = useExplorer((state) => state.isolatedIds);
  const select = useExplorer((state) => state.select);
  const isolate = useExplorer((state) => state.isolate);
  const toggleHidden = useExplorer((state) => state.toggleHidden);
  const toggleBookmark = useExplorer((state) => state.toggleBookmark);
  const askAssistant = useExplorer((state) => state.askAssistant);
  const isIsolatedAlone = isolatedIds?.length === 1 && isolatedIds[0] === component.id;

  const system = systemsById.get(component.systemId);
  const assembly = component.assemblyId ? assembliesById.get(component.assemblyId) : undefined;
  const assemblyMembers = assembly ? components.filter((candidate) => candidate.assemblyId === assembly.id && candidate.id !== component.id) : [];
  const symptoms = component.symptomIds.map((id) => symptomsById.get(id)).filter((symptom) => symptom !== undefined);
  const mapping = vehiclePackage.modelMap.parts[component.id];
  const incoming = useMemo(() => findIncomingRelations(components, component.id), [components, component.id]);
  const relatedIds = [...component.relations.map((relation) => relation.target), ...incoming.map((relation) => relation.sourceId)];

  const groupedRelations = RELATION_TYPES.flatMap((type) => {
    const outgoing = component.relations.filter((relation) => relation.type === type).map((relation) => relation.target);
    const incomingIds = incoming.filter((relation) => relation.type === type).map((relation) => relation.sourceId);
    return [
      ...(outgoing.length > 0 ? [{ key: `relationOut_${type}` as MessageKey, ids: outgoing }] : []),
      ...(incomingIds.length > 0 ? [{ key: `relationIn_${type}` as MessageKey, ids: incomingIds }] : []),
    ];
  });

  const sourceIds = new Set(
    [
      component.fitment?.sourceId,
      ...component.specs.map((spec) => spec.sourceId),
      ...component.partNumbers.map((partNumber) => partNumber.sourceId),
      ...component.docs.map((doc) => doc.sourceId),
    ].filter((id): id is string => Boolean(id)),
  );
  const usedSources = vehiclePackage.sources.filter((source) => sourceIds.has(source.id));
  const words = { and: t("and"), or: t("or"), not: t("not") };

  return (
    <div className="detail">
      <header className="detail-header">
        <div className="detail-header-row">
          <nav className="detail-kicker" aria-label={t("parentAssembly")}>
            {system && <Localized text={system.name} />}
            {assembly && (
              <>
                <span aria-hidden="true"> › </span>
                <Localized text={assembly.name} />
              </>
            )}
          </nav>
          <button type="button" className="icon-button" onClick={() => select(null)} aria-label={t("clearSelection")}>
            <X weight="bold" aria-hidden="true" />
          </button>
        </div>
        <h2 className="detail-title">
          <Localized text={component.name} />
        </h2>
        <div className="detail-actions">
          <button type="button" className="button button-quiet" onClick={() => select(component.id, { focus: true })}>
            <Crosshair weight="bold" aria-hidden="true" />
            {t("focus")}
          </button>
          <button
            type="button"
            className="button button-quiet"
            aria-pressed={isIsolatedAlone}
            onClick={() => isolate(isIsolatedAlone ? null : [component.id], { focus: !isIsolatedAlone })}
          >
            <FrameCorners weight="bold" aria-hidden="true" />
            {isIsolatedAlone ? t("exitIsolate") : t("isolate")}
          </button>
          <button
            type="button"
            className="button button-quiet"
            disabled={relatedIds.length === 0}
            onClick={() => isolate([component.id, ...relatedIds], { focus: true })}
          >
            <Graph weight="bold" aria-hidden="true" />
            {t("showConnected")}
          </button>
          <button type="button" className="button button-quiet" onClick={() => toggleHidden(component.id)}>
            <EyeSlash weight="bold" aria-hidden="true" />
            {t("hide")}
          </button>
          <button type="button" className="button button-quiet" aria-pressed={isBookmarked} onClick={() => toggleBookmark(component.id)}>
            <BookmarkSimple weight={isBookmarked ? "fill" : "bold"} aria-hidden="true" />
            {isBookmarked ? t("unbookmark") : t("bookmark")}
          </button>
        </div>
      </header>

      <section className="detail-section">
        <h3>{t("function")}</h3>
        <p>
          <Localized text={component.function} />
        </p>
      </section>

      <section className="detail-section">
        <h3>{t("location")}</h3>
        <p>
          <Localized text={component.location} />
        </p>
        {mapping?.placementStatus === "approximate" && <p className="section-hint">{t("placementApproximate")}</p>}
      </section>

      <section className="detail-section">
        <h3>{t("fitment")}</h3>
        {component.appliesWhen ? (
          <>
            <p className="fitment-rule">
              {describePredicate(component.appliesWhen, vehiclePackage.vehicle.axes, language, words)}{" "}
              <StatusBadge status={component.fitment?.status ?? "unverified"} />
            </p>
            {component.fitment?.note && (
              <p className="section-hint">
                <Localized text={component.fitment.note} />
              </p>
            )}
          </>
        ) : (
          <p>{t("fitmentAll")}</p>
        )}
      </section>

      {component.specs.length > 0 && (
        <section className="detail-section">
          <h3>{t("specifications")}</h3>
          <table className="spec-table">
            <tbody>
              {component.specs.map((spec, index) => (
                <tr key={`${spec.key}-${index}`}>
                  <th scope="row">
                    <Localized text={spec.label} />
                    {spec.note && (
                      <span className="spec-note">
                        <Localized text={spec.note} />
                      </span>
                    )}
                  </th>
                  <td className={spec.status === "missing" ? "spec-value is-missing" : "spec-value"} translate={spec.status === "missing" ? undefined : "no"}>
                    {spec.status === "missing" ? t("noReliableData") : `${spec.value}${spec.unit ? ` ${spec.unit}` : ""}`}
                  </td>
                  <td>
                    <StatusBadge status={spec.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="detail-section">
        <h3>{t("partNumbers")}</h3>
        {component.partNumbers.length > 0 ? (
          <ul className="part-number-list">
            {component.partNumbers.map((partNumber) => (
              <li key={partNumber.value}>
                <span className="spec-value">{partNumber.value}</span> <StatusBadge status={partNumber.status} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="section-hint">{t("partNumbersEmpty")}</p>
        )}
      </section>

      <section className="detail-section">
        <h3>{t("connections")}</h3>
        {groupedRelations.length === 0 ? (
          <p className="section-hint">{t("connectionsEmpty")}</p>
        ) : (
          <dl className="relation-list">
            {groupedRelations.map((group) => (
              <div key={group.key} className="relation-group">
                <dt>{t(group.key)}</dt>
                <dd>
                  {group.ids.map((id) => {
                    const target = componentsById.get(id);
                    if (!target) return null;
                    return (
                      <button key={id} type="button" className="chip" onClick={() => select(id, { focus: true })}>
                        {local(target.name).text}
                      </button>
                    );
                  })}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      {assembly && assemblyMembers.length > 0 && (
        <section className="detail-section">
          <h3>
            {t("sameAssembly")} <Localized text={assembly.name} />
          </h3>
          <div className="chip-row chip-row-tight">
            {assemblyMembers.map((member) => (
              <button key={member.id} type="button" className="chip" onClick={() => select(member.id, { focus: true })}>
                {local(member.name).text}
              </button>
            ))}
          </div>
        </section>
      )}

      {symptoms.length > 0 && (
        <section className="detail-section">
          <h3>{t("possibleSymptoms")}</h3>
          <p className="section-hint">{t("possibleSymptomsHint")}</p>
          <ul className="symptom-list">
            {symptoms.map((symptom) => (
              <li key={symptom.id}>
                <span>
                  <Localized text={symptom.name} />
                </span>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => askAssistant(`${local(symptom.name).text}: ${t("askAboutPartPrompt")} ${local(component.name).text}?`)}
                >
                  {t("askAssistant")}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {component.docs.length > 0 && (
        <section className="detail-section">
          <h3>{t("documentation")}</h3>
          <ul className="doc-list">
            {component.docs.map((doc) => (
              <li key={`${doc.kind}-${doc.url}-${local(doc.title).text}`}>
                <span className="doc-kind">{t(DOC_KIND_KEYS[doc.kind])}</span>
                <a href={doc.url} target="_blank" rel="noopener noreferrer" hrefLang={doc.lang}>
                  <Localized text={doc.title} />
                  <ArrowSquareOut weight="bold" aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {component.extra && Object.keys(component.extra).length > 0 && (
        <section className="detail-section">
          <h3>{t("details")}</h3>
          <table className="spec-table">
            <tbody>
              {Object.entries(component.extra).map(([key, value]) => (
                <tr key={key}>
                  <th scope="row">{key}</th>
                  <td className="spec-value">{String(value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <SourceLinks sources={usedSources} />
    </div>
  );
}

export function DetailPanel() {
  const { componentsById } = useVehicleData();
  const selectedId = useExplorer((state) => state.selectedId);
  const select = useExplorer((state) => state.select);
  const selected = selectedId ? componentsById.get(selectedId) : undefined;

  useEffect(() => {
    if (selectedId && !selected) select(null);
  }, [selectedId, selected, select]);

  return (
    <aside className="detail-panel">
      {selected ? <ComponentDetails key={selected.id} component={selected} /> : <VehicleOverview />}
    </aside>
  );
}
