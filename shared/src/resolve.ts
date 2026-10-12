import { appliesTo } from "./predicate";
import type { Component, Language, LocalizedText, PartMapping, Shape, VehicleConfig, VehiclePackage } from "./schema";

export interface LocalizedValue {
  text: string;
  isFallback: boolean;
}

export function localize(text: LocalizedText, language: Language): LocalizedValue {
  if (typeof text === "string") return { text, isFallback: false };
  const translated = text[language];
  if (translated) return { text: translated, isFallback: false };
  return { text: text.en, isFallback: language !== "en" };
}

export function resolveComponents(vehiclePackage: VehiclePackage, config: VehicleConfig): Component[] {
  const applicable = vehiclePackage.components.filter((component) => appliesTo(component.appliesWhen, config));
  const applicableIds = new Set(applicable.map((component) => component.id));
  return applicable.map((component) => ({
    ...component,
    specs: component.specs.filter((spec) => appliesTo(spec.appliesWhen, config)),
    partNumbers: component.partNumbers.filter((partNumber) => appliesTo(partNumber.appliesWhen, config)),
    docs: component.docs.filter((doc) => appliesTo(doc.appliesWhen, config)),
    relations: component.relations.filter(
      (relation) => applicableIds.has(relation.target) && appliesTo(relation.appliesWhen, config),
    ),
  }));
}

export function englishText(text: LocalizedText): string {
  return typeof text === "string" ? text : text.en;
}

export function allTranslations(text: LocalizedText): string[] {
  return typeof text === "string" ? [text] : [text.en, text.lv, text.ru].filter((value): value is string => Boolean(value));
}

export function resolvePartMapping(mapping: PartMapping, config: VehicleConfig): { meshes: string[]; shapes: Shape[] } {
  const variant = mapping.variants.find((candidate) => appliesTo(candidate.appliesWhen, config));
  return variant ? { meshes: variant.meshes, shapes: variant.shapes } : { meshes: mapping.meshes, shapes: mapping.shapes };
}

export function isOptionCompatible(validConfigs: VehicleConfig[], current: VehicleConfig, axisId: string, optionId: string): boolean {
  return validConfigs.some(
    (candidate) => candidate[axisId] === optionId && Object.entries(current).every(([key, value]) => key === axisId || candidate[key] === value),
  );
}

export interface IncomingRelation {
  sourceId: string;
  type: Component["relations"][number]["type"];
}

export function findIncomingRelations(components: Component[], targetId: string): IncomingRelation[] {
  return components.flatMap((component) =>
    component.relations
      .filter((relation) => relation.target === targetId)
      .map((relation) => ({ sourceId: component.id, type: relation.type })),
  );
}
