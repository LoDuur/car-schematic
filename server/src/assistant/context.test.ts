import { describe, expect, it } from "vitest";
import { loadVehiclePackage } from "../vehicleStore";
import { buildAssistantContext } from "./context";
import { buildSystemInstruction } from "./gemini";
import { keepKnownComponents } from "./reply";

const vehiclePackage = (await loadVehiclePackage("bmw-e60"))!;
const dieselConfig = { ...vehiclePackage.vehicle.defaultConfig, year: "2008", model: "520d", engine: "N47D20", fuel: "diesel" };

describe("buildAssistantContext", () => {
  it("only allows components from the selected configuration", () => {
    const context = buildAssistantContext(vehiclePackage, dieselConfig, "en", "car will not start when cold", undefined);
    expect(context.allowedComponentIds).toContain("glow-plugs");
    expect(context.allowedComponentIds).not.toContain("spark-plugs");
  });

  it("puts the selected component and keyword matches first", () => {
    const context = buildAssistantContext(vehiclePackage, dieselConfig, "lv", "glow plug problem", "battery");
    const ids = context.components.map((component) => (component as { id: string }).id);
    expect(ids[0]).toBe("battery");
    expect(ids.slice(0, 4)).toContain("glow-plugs");
  });

  it("labels missing specs instead of leaving them blank", () => {
    const context = buildAssistantContext(vehiclePackage, dieselConfig, "en", "spark", undefined);
    const radiator = context.components.find((component) => (component as { id: string }).id === "radiator") as {
      specs: { value: string }[];
    };
    expect(radiator.specs.every((spec) => spec.value === "NO RELIABLE DATA")).toBe(true);
  });

  it("ranks parts linked to a described symptom near the top", () => {
    const petrolConfig = vehiclePackage.vehicle.defaultConfig;
    const context = buildAssistantContext(vehiclePackage, petrolConfig, "en", "it has a rough idle", undefined);
    const topIds = context.components.slice(0, 8).map((component) => (component as { id: string }).id);
    expect(topIds).toEqual(expect.arrayContaining(["ignition-coils", "spark-plugs", "throttle-body"]));
  });

  it("tells the model which part the user means by this part", () => {
    const context = buildAssistantContext(vehiclePackage, dieselConfig, "en", "what does this part do?", "turbocharger");
    expect(context.selectedComponentId).toBe("turbocharger");
    expect(buildSystemInstruction(context)).toContain('"Turbocharger" (id turbocharger) selected');
  });

  it("states the configuration and reply language in the instruction", () => {
    const context = buildAssistantContext(vehiclePackage, dieselConfig, "ru", "noise", undefined);
    const instruction = buildSystemInstruction(context);
    expect(instruction).toContain("Reply only in Russian");
    expect(instruction).toContain("N47D20");
    expect(instruction).toContain("never a confirmed diagnosis");
  });
});

describe("keepKnownComponents", () => {
  it("removes ids the model invented", () => {
    const reply = keepKnownComponents(
      {
        answer: "Check the glow plugs.",
        components: [
          { id: "glow-plugs", reason: "cold start" },
          { id: "made-up-part", reason: "invented" },
        ],
        possibleCauses: [{ title: "Worn glow plugs", explanation: "", componentIds: ["glow-plugs", "spark-plugs"], checks: [] }],
        actions: [
          { type: "highlight", componentIds: ["glow-plugs", "made-up-part"] },
          { type: "isolate", componentIds: ["made-up-part"] },
        ],
        dataGaps: [],
      },
      new Set(["glow-plugs"]),
    );
    expect(reply.components.map((component) => component.id)).toEqual(["glow-plugs"]);
    expect(reply.possibleCauses[0]!.componentIds).toEqual(["glow-plugs"]);
    expect(reply.actions).toEqual([{ type: "highlight", componentIds: ["glow-plugs"] }]);
  });
});
