import { isValidConfig, listValidConfigs } from "./predicate";
import type { Predicate, VehiclePackage } from "./schema";

function collectAxisReferences(predicate: Predicate, found: { axis: string; value: string }[] = []) {
  if ("axis" in predicate) {
    predicate.in.forEach((value) => found.push({ axis: predicate.axis, value }));
  } else if ("all" in predicate) {
    predicate.all.forEach((child) => collectAxisReferences(child, found));
  } else if ("any" in predicate) {
    predicate.any.forEach((child) => collectAxisReferences(child, found));
  } else {
    collectAxisReferences(predicate.not, found);
  }
  return found;
}

export function findPackageProblems(vehiclePackage: VehiclePackage): string[] {
  const problems: string[] = [];
  const { vehicle, systems, components, sources, modelMap } = vehiclePackage;
  const axisOptions = new Map(vehicle.axes.map((axis) => [axis.id, new Set(axis.options.map((option) => option.id))]));
  const systemIds = new Set(systems.map((system) => system.id));
  const assemblies = new Map(vehiclePackage.assemblies.map((assembly) => [assembly.id, assembly]));
  const symptomIds = new Set(vehiclePackage.symptoms.map((symptom) => symptom.id));
  vehiclePackage.assemblies.forEach((assembly) => {
    if (!systemIds.has(assembly.systemId)) problems.push(`assembly ${assembly.id}: unknown system "${assembly.systemId}"`);
  });
  vehicle.summaryAxes.forEach((axisId) => {
    if (!axisOptions.has(axisId)) problems.push(`summaryAxes: unknown axis "${axisId}"`);
  });
  const sourceIds = new Set(sources.map((source) => source.id));
  const componentIds = new Set<string>();

  const checkPredicate = (predicate: Predicate | undefined, where: string) => {
    if (!predicate) return;
    for (const reference of collectAxisReferences(predicate)) {
      const options = axisOptions.get(reference.axis);
      if (!options) problems.push(`${where}: unknown axis "${reference.axis}"`);
      else if (!options.has(reference.value)) problems.push(`${where}: unknown option "${reference.value}" on axis "${reference.axis}"`);
    }
  };
  const checkSource = (sourceId: string | undefined, where: string) => {
    if (sourceId && !sourceIds.has(sourceId)) problems.push(`${where}: unknown source "${sourceId}"`);
  };

  vehicle.rules.forEach((rule) => {
    checkPredicate(rule.when, `rule ${rule.id}`);
    checkPredicate(rule.require, `rule ${rule.id}`);
  });
  vehicle.facts.forEach((fact, index) => checkSource(fact.sourceId, `vehicle fact ${index}`));
  if (!isValidConfig(vehicle, vehicle.defaultConfig)) problems.push("defaultConfig is incomplete or breaks a rule");
  if (listValidConfigs(vehicle).length === 0) problems.push("no configuration satisfies all rules");

  for (const component of components) {
    const where = `component ${component.id}`;
    if (componentIds.has(component.id)) problems.push(`${where}: duplicate id`);
    componentIds.add(component.id);
    if (!systemIds.has(component.systemId)) problems.push(`${where}: unknown system "${component.systemId}"`);
    if (component.assemblyId) {
      const assembly = assemblies.get(component.assemblyId);
      if (!assembly) problems.push(`${where}: unknown assembly "${component.assemblyId}"`);
      else if (assembly.systemId !== component.systemId) problems.push(`${where}: assembly "${assembly.id}" belongs to system "${assembly.systemId}"`);
    }
    component.symptomIds.forEach((symptomId) => {
      if (!symptomIds.has(symptomId)) problems.push(`${where}: unknown symptom "${symptomId}"`);
    });
    checkPredicate(component.appliesWhen, where);
    component.specs.forEach((spec) => {
      checkPredicate(spec.appliesWhen, `${where} spec ${spec.key}`);
      checkSource(spec.sourceId, `${where} spec ${spec.key}`);
    });
    component.partNumbers.forEach((partNumber) => {
      checkPredicate(partNumber.appliesWhen, `${where} part number ${partNumber.value}`);
      checkSource(partNumber.sourceId, `${where} part number ${partNumber.value}`);
    });
    component.docs.forEach((doc) => {
      checkPredicate(doc.appliesWhen, `${where} doc ${doc.url}`);
      checkSource(doc.sourceId, `${where} doc ${doc.url}`);
    });
    checkSource(component.fitment?.sourceId, `${where} fitment`);
  }

  for (const component of components) {
    for (const relation of component.relations) {
      if (!componentIds.has(relation.target)) problems.push(`component ${component.id}: relation to unknown "${relation.target}"`);
      if (relation.target === component.id) problems.push(`component ${component.id}: relation to itself`);
      checkPredicate(relation.appliesWhen, `component ${component.id} relation ${relation.target}`);
    }
    const mapping = modelMap.parts[component.id];
    mapping?.variants.forEach((variant, index) => checkPredicate(variant.appliesWhen, `model map ${component.id} variant ${index}`));
    if (!mapping || (mapping.meshes.length === 0 && mapping.shapes.length === 0 && mapping.variants.length === 0)) {
      problems.push(`component ${component.id}: no 3D mapping`);
    }
  }
  for (const mappedId of Object.keys(modelMap.parts)) {
    if (!componentIds.has(mappedId)) problems.push(`model map: unknown component "${mappedId}"`);
  }
  return problems;
}
