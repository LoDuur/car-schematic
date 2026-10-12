import {
  allTranslations,
  englishText,
  localize,
  resolveComponents,
  type Component,
  type Language,
  type VehicleConfig,
  type VehiclePackage,
} from "@car-schematic/shared";

export const MAX_CONTEXT_COMPONENTS = 40;
const KEYWORD_SCORE = 3;
const SELECTED_SCORE = 10;
const RELATED_SCORE = 2;
const MIN_TOKEN_LENGTH = 3;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= MIN_TOKEN_LENGTH);
}

function stem(token: string): string {
  return token.length > 5 ? token.slice(0, token.length - 2) : token;
}

function searchableText(component: Component, systemName: string, extraTerms: string): string {
  const names = allTranslations(component.name).join(" ");
  return [names, component.aliases.join(" "), englishText(component.function), systemName, extraTerms].join(" ").toLowerCase();
}

export function rankComponents(
  components: Component[],
  systemNames: Map<string, string>,
  message: string,
  selectedId: string | undefined,
  extraTerms: Map<string, string> = new Map(),
): Component[] {
  const stems = [...new Set(tokenize(message).map(stem))];
  const selected = components.find((component) => component.id === selectedId);
  const relatedIds = new Set(selected?.relations.map((relation) => relation.target) ?? []);
  components
    .filter((component) => component.relations.some((relation) => relation.target === selectedId))
    .forEach((component) => relatedIds.add(component.id));

  const scored = components.map((component, index) => {
    const text = searchableText(component, systemNames.get(component.systemId) ?? "", extraTerms.get(component.id) ?? "");
    let score = stems.reduce((total, token) => (text.includes(token) ? total + KEYWORD_SCORE : total), 0);
    if (component.id === selectedId) score += SELECTED_SCORE;
    if (relatedIds.has(component.id)) score += RELATED_SCORE;
    return { component, score, index };
  });
  scored.sort((left, right) => right.score - left.score || left.index - right.index);
  return scored.slice(0, MAX_CONTEXT_COMPONENTS).map((entry) => entry.component);
}

export interface AssistantContext {
  vehicle: string;
  configuration: Record<string, string>;
  replyLanguage: Language;
  selectedComponentId: string | null;
  selectedComponentName: string | null;
  components: unknown[];
  allowedComponentIds: string[];
}

export function buildAssistantContext(
  vehiclePackage: VehiclePackage,
  config: VehicleConfig,
  language: Language,
  message: string,
  selectedId: string | undefined,
): AssistantContext {
  const resolved = resolveComponents(vehiclePackage, config);
  const systemNames = new Map(vehiclePackage.systems.map((system) => [system.id, englishText(system.name)]));
  const assemblyNames = new Map(vehiclePackage.assemblies.map((assembly) => [assembly.id, englishText(assembly.name)]));
  const symptomsById = new Map(vehiclePackage.symptoms.map((symptom) => [symptom.id, symptom]));
  const symptomNames = (component: Component) =>
    component.symptomIds.map((id) => symptomsById.get(id)).filter((symptom) => symptom !== undefined);
  const extraTerms = new Map(
    resolved.map((component) => [
      component.id,
      [
        component.assemblyId ? assemblyNames.get(component.assemblyId) : "",
        ...symptomNames(component).flatMap((symptom) => [...allTranslations(symptom.name), ...symptom.aliases]),
      ].join(" "),
    ]),
  );
  const ranked = rankComponents(resolved, systemNames, message, selectedId, extraTerms);
  const selectedComponent = resolved.find((component) => component.id === selectedId);

  const configuration = Object.fromEntries(
    vehiclePackage.vehicle.axes.map((axis) => {
      const option = axis.options.find((candidate) => candidate.id === config[axis.id]);
      return [englishText(axis.label), option ? englishText(option.label) : "not selected"];
    }),
  );

  const components = ranked.map((component) => ({
    id: component.id,
    system: systemNames.get(component.systemId),
    assembly: component.assemblyId ? assemblyNames.get(component.assemblyId) : undefined,
    name: englishText(component.name),
    localName: localize(component.name, language).text,
    function: englishText(component.function),
    location: englishText(component.location),
    fitment: component.appliesWhen ? (component.fitment?.status ?? "unverified") : "all configurations",
    specs: component.specs.map((spec) => ({
      name: englishText(spec.label),
      value: spec.status === "missing" ? "NO RELIABLE DATA" : `${spec.value}${spec.unit ? ` ${spec.unit}` : ""}`,
      status: spec.status,
    })),
    relations: component.relations.map((relation) => `${relation.type} ${relation.target}`),
    possiblyLinkedSymptoms: symptomNames(component).map((symptom) => englishText(symptom.name)),
  }));

  return {
    vehicle: `${vehiclePackage.vehicle.make} ${vehiclePackage.vehicle.model} (${vehiclePackage.vehicle.generation})`,
    configuration,
    replyLanguage: language,
    selectedComponentId: selectedComponent ? selectedComponent.id : null,
    selectedComponentName: selectedComponent ? englishText(selectedComponent.name) : null,
    components,
    allowedComponentIds: resolved.map((component) => component.id),
  };
}
