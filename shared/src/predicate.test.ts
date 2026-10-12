import { describe, expect, it } from "vitest";
import { availableOptionIds, chooseOption, evaluatePredicate, findBrokenRules, listValidConfigs } from "./predicate";
import type { Vehicle } from "./schema";

const vehicle: Vehicle = {
  id: "test-car",
  make: "Test",
  model: "Car",
  generation: "T1",
  name: "Test Car",
  summary: "Test vehicle",
  axes: [
    { id: "engine", label: "Engine", options: [{ id: "p1", label: "P1" }, { id: "d1", label: "D1" }] },
    { id: "fuel", label: "Fuel", options: [{ id: "petrol", label: "Petrol" }, { id: "diesel", label: "Diesel" }] },
    { id: "drive", label: "Drive", options: [{ id: "rwd", label: "RWD" }, { id: "awd", label: "AWD" }] },
  ],
  rules: [
    { id: "petrol", when: { axis: "fuel", in: ["petrol"] }, require: { axis: "engine", in: ["p1"] }, reason: "petrol" },
    { id: "diesel", when: { axis: "fuel", in: ["diesel"] }, require: { axis: "engine", in: ["d1"] }, reason: "diesel" },
    { id: "awd-diesel-only", when: { axis: "drive", in: ["awd"] }, require: { axis: "engine", in: ["d1"] }, reason: "awd" },
  ],
  defaultConfig: { engine: "p1", fuel: "petrol", drive: "rwd" },
  summaryAxes: [],
  facts: [],
};

describe("evaluatePredicate", () => {
  const config = { engine: "p1", fuel: "petrol", drive: "rwd" };

  it("matches axis membership", () => {
    expect(evaluatePredicate({ axis: "engine", in: ["p1", "x"] }, config)).toBe(true);
    expect(evaluatePredicate({ axis: "engine", in: ["d1"] }, config)).toBe(false);
  });

  it("treats a missing axis as not matching", () => {
    expect(evaluatePredicate({ axis: "body", in: ["sedan"] }, config)).toBe(false);
  });

  it("combines all, any and not", () => {
    expect(evaluatePredicate({ all: [{ axis: "engine", in: ["p1"] }, { axis: "drive", in: ["rwd"] }] }, config)).toBe(true);
    expect(evaluatePredicate({ any: [{ axis: "engine", in: ["d1"] }, { axis: "drive", in: ["rwd"] }] }, config)).toBe(true);
    expect(evaluatePredicate({ not: { axis: "fuel", in: ["petrol"] } }, config)).toBe(false);
  });
});

describe("compatibility rules", () => {
  it("reports broken rules", () => {
    const broken = findBrokenRules(vehicle.rules, { engine: "p1", fuel: "diesel", drive: "awd" });
    expect(broken.map((rule) => rule.id)).toEqual(["diesel", "awd-diesel-only"]);
  });

  it("lists only valid configurations", () => {
    const valid = listValidConfigs(vehicle);
    expect(valid).toEqual([
      { engine: "p1", fuel: "petrol", drive: "rwd" },
      { engine: "d1", fuel: "diesel", drive: "rwd" },
      { engine: "d1", fuel: "diesel", drive: "awd" },
    ]);
    expect([...availableOptionIds(valid, "drive")]).toEqual(["rwd", "awd"]);
  });

  it("changes the fewest other axes when an option is chosen", () => {
    const valid = listValidConfigs(vehicle);
    const next = chooseOption(valid, vehicle.axes, vehicle.defaultConfig, "drive", "awd");
    expect(next).toEqual({ engine: "d1", fuel: "diesel", drive: "awd" });
  });

  it("returns null when no valid configuration has the option", () => {
    const valid = listValidConfigs(vehicle);
    expect(chooseOption(valid, vehicle.axes, vehicle.defaultConfig, "engine", "missing")).toBeNull();
  });
});
