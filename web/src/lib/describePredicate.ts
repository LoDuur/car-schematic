import { localize, type ConfigAxis, type Language, type Predicate } from "@car-schematic/shared";

interface Words {
  and: string;
  or: string;
  not: string;
}

export function describePredicate(predicate: Predicate, axes: ConfigAxis[], language: Language, words: Words): string {
  if ("axis" in predicate) {
    const axis = axes.find((candidate) => candidate.id === predicate.axis);
    if (!axis) return predicate.in.join(", ");
    const values = predicate.in.map((id) => {
      const option = axis.options.find((candidate) => candidate.id === id);
      return option ? localize(option.label, language).text : id;
    });
    return `${localize(axis.label, language).text}: ${values.join(", ")}`;
  }
  if ("all" in predicate) {
    return predicate.all.map((child) => describePredicate(child, axes, language, words)).join(`; ${words.and} `);
  }
  if ("any" in predicate) {
    return predicate.any.map((child) => `(${describePredicate(child, axes, language, words)})`).join(` ${words.or} `);
  }
  return `${words.not} (${describePredicate(predicate.not, axes, language, words)})`;
}
