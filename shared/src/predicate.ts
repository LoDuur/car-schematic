import type { CompatibilityRule, ConfigAxis, Predicate, Vehicle, VehicleConfig } from "./schema";

export function evaluatePredicate(predicate: Predicate, config: VehicleConfig): boolean {
  if ("axis" in predicate) {
    const selected = config[predicate.axis];
    return selected !== undefined && predicate.in.includes(selected);
  }
  if ("all" in predicate) return predicate.all.every((child) => evaluatePredicate(child, config));
  if ("any" in predicate) return predicate.any.some((child) => evaluatePredicate(child, config));
  return !evaluatePredicate(predicate.not, config);
}

export function appliesTo(appliesWhen: Predicate | undefined, config: VehicleConfig): boolean {
  return appliesWhen === undefined || evaluatePredicate(appliesWhen, config);
}

export function findBrokenRules(rules: CompatibilityRule[], config: VehicleConfig): CompatibilityRule[] {
  return rules.filter((rule) => appliesTo(rule.when, config) && !evaluatePredicate(rule.require, config));
}

export function isCompleteConfig(axes: ConfigAxis[], config: VehicleConfig): boolean {
  return axes.every((axis) => axis.options.some((option) => option.id === config[axis.id]));
}

export function isValidConfig(vehicle: Vehicle, config: VehicleConfig): boolean {
  return isCompleteConfig(vehicle.axes, config) && findBrokenRules(vehicle.rules, config).length === 0;
}

const MAX_ENUMERATED_CONFIGS = 500_000;

function* enumerateConfigs(axes: ConfigAxis[]): Generator<VehicleConfig> {
  const indices = axes.map(() => 0);
  let produced = 0;
  while (produced < MAX_ENUMERATED_CONFIGS) {
    const config: VehicleConfig = {};
    axes.forEach((axis, axisIndex) => {
      config[axis.id] = axis.options[indices[axisIndex] ?? 0]!.id;
    });
    yield config;
    produced += 1;
    let position = axes.length - 1;
    while (position >= 0) {
      indices[position] = (indices[position] ?? 0) + 1;
      if ((indices[position] ?? 0) < axes[position]!.options.length) break;
      indices[position] = 0;
      position -= 1;
    }
    if (position < 0) return;
  }
}

export function listValidConfigs(vehicle: Vehicle): VehicleConfig[] {
  const valid: VehicleConfig[] = [];
  for (const config of enumerateConfigs(vehicle.axes)) {
    if (findBrokenRules(vehicle.rules, config).length === 0) valid.push(config);
  }
  return valid;
}

export function availableOptionIds(validConfigs: VehicleConfig[], axisId: string): Set<string> {
  return new Set(validConfigs.map((config) => config[axisId]).filter((id): id is string => id !== undefined));
}

function countChangedAxes(candidate: VehicleConfig, current: VehicleConfig, axes: ConfigAxis[]): number {
  return axes.reduce((changed, axis) => (candidate[axis.id] === current[axis.id] ? changed : changed + 1), 0);
}

export function chooseOption(
  validConfigs: VehicleConfig[],
  axes: ConfigAxis[],
  current: VehicleConfig,
  axisId: string,
  optionId: string,
): VehicleConfig | null {
  let best: VehicleConfig | null = null;
  let bestChanges = Number.POSITIVE_INFINITY;
  for (const candidate of validConfigs) {
    if (candidate[axisId] !== optionId) continue;
    const changes = countChangedAxes(candidate, current, axes);
    if (changes < bestChanges) {
      best = candidate;
      bestChanges = changes;
    }
  }
  return best;
}
