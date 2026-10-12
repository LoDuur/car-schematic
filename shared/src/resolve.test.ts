import { describe, expect, it } from "vitest";
import { isOptionCompatible, resolvePartMapping } from "./resolve";
import type { PartMapping } from "./schema";

describe("resolvePartMapping", () => {
  const mapping: PartMapping = {
    meshes: ["engine-block"],
    shapes: [],
    variants: [{ appliesWhen: { axis: "engine", in: ["v8"] }, meshes: ["engine-block-v8"], shapes: [] }],
    placementStatus: "approximate",
  };

  it("uses the first variant whose rule matches the configuration", () => {
    expect(resolvePartMapping(mapping, { engine: "v8" }).meshes).toEqual(["engine-block-v8"]);
  });

  it("falls back to the base mapping when no variant matches", () => {
    expect(resolvePartMapping(mapping, { engine: "i6" }).meshes).toEqual(["engine-block"]);
  });
});

describe("isOptionCompatible", () => {
  const validConfigs = [
    { engine: "p1", fuel: "petrol" },
    { engine: "d1", fuel: "diesel" },
  ];

  it("is true when the option keeps every other choice", () => {
    expect(isOptionCompatible(validConfigs, { engine: "p1", fuel: "petrol" }, "engine", "p1")).toBe(true);
  });

  it("is false when choosing the option would force another change", () => {
    expect(isOptionCompatible(validConfigs, { engine: "p1", fuel: "petrol" }, "engine", "d1")).toBe(false);
  });
});
