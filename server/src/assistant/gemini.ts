import { ApiError, GoogleGenAI, Type, type Schema } from "@google/genai";
import type { AssistantContext } from "./context";
import { assistantReplySchema, type AssistantReply } from "./reply";

const DEFAULT_MODEL = "gemini-flash-latest";
const DEFAULT_FALLBACK_MODEL = "gemini-flash-lite-latest";
const REQUEST_TIMEOUT_MS = 20_000;
const NON_RECOVERABLE_STATUSES = new Set([400, 401, 403]);
const LANGUAGE_NAMES = { en: "English", lv: "Latvian", ru: "Russian" } as const;

export interface ChatTurn {
  role: "user" | "model";
  text: string;
}

export class AssistantNotConfiguredError extends Error {}
export class AssistantUpstreamError extends Error {}

let client: GoogleGenAI | null = null;

export function isAssistantConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new AssistantNotConfiguredError("GEMINI_API_KEY is not set");
  client ??= new GoogleGenAI({ apiKey });
  return client;
}

const responseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    answer: { type: Type.STRING },
    components: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { id: { type: Type.STRING }, reason: { type: Type.STRING } },
        required: ["id", "reason"],
      },
    },
    possibleCauses: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          explanation: { type: Type.STRING },
          componentIds: { type: Type.ARRAY, items: { type: Type.STRING } },
          checks: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ["title", "explanation", "componentIds", "checks"],
      },
    },
    actions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          type: { type: Type.STRING, enum: ["highlight", "select", "focus", "isolate"] },
          componentIds: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ["type", "componentIds"],
      },
    },
    dataGaps: { type: Type.ARRAY, items: { type: Type.STRING } },
    safety: { type: Type.STRING },
  },
  required: ["answer", "components", "possibleCauses", "actions", "dataGaps"],
};

export function buildSystemInstruction(context: AssistantContext): string {
  return [
    `You are a vehicle technical assistant for a ${context.vehicle}.`,
    `Reply only in ${LANGUAGE_NAMES[context.replyLanguage]}, in every text field.`,
    "The user's exact vehicle configuration and its component database are given below as JSON. Only these components exist in this configuration.",
    "Use only values from the component data when you state specifications, capacities, torque values or part numbers. If a value is marked NO RELIABLE DATA or is absent, say that the data is not available and add it to dataGaps. Never estimate or invent such values.",
    "General knowledge about how systems work is allowed, but must not contradict the data.",
    "When the user describes a problem, list possibleCauses ordered from most to least likely. Each one is a possibility, never a confirmed diagnosis. Do not write that a part is faulty or confirmed. For each cause give concrete checks that would confirm or rule it out.",
    "In components, list the ids of the components the user should look at, using ids from the data exactly. Use an empty list if none apply.",
    "The website can act on the 3D model for you. In actions, request what it should do using component ids from the data: highlight marks parts, select opens one part's information panel, focus moves the camera to parts, isolate shows only those parts. Usually highlight every part you discuss and focus on the most relevant ones. Use isolate only when the user asks to see parts on their own.",
    context.selectedComponentId
      ? `The user currently has "${context.selectedComponentName}" (id ${context.selectedComponentId}) selected. Words like "this part", "it" or "this" refer to it unless the user names another part.`
      : "No part is selected in the model.",
    "possiblyLinkedSymptoms lists symptoms a part can be involved in. These are possible links, not evidence that the part is faulty.",
    "If the question involves fuel, high voltage, airbags, brakes, lifting the car or hot coolant, put a short safety note in safety.",
    "Keep answer short and practical: at most about 180 words.",
    `Data:\n${JSON.stringify({
      vehicle: context.vehicle,
      configuration: context.configuration,
      selectedComponentId: context.selectedComponentId,
      components: context.components,
    })}`,
  ].join("\n");
}

function listModelsToTry(): string[] {
  const primaryModel = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const fallbackModel = process.env.GEMINI_FALLBACK_MODEL || DEFAULT_FALLBACK_MODEL;
  return [...new Set([primaryModel, fallbackModel])];
}

function canTryAnotherModel(error: unknown): boolean {
  return !(error instanceof ApiError && NON_RECOVERABLE_STATUSES.has(error.status));
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function askGemini(context: AssistantContext, history: ChatTurn[], message: string): Promise<AssistantReply> {
  const ai = getClient();
  const contents = [
    ...history.map((turn) => ({ role: turn.role, parts: [{ text: turn.text }] })),
    { role: "user", parts: [{ text: message }] },
  ];
  const systemInstruction = buildSystemInstruction(context);
  const failures: string[] = [];
  let rawText: string | undefined;

  for (const model of listModelsToTry()) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema,
          temperature: 0.2,
          abortSignal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        },
      });
      rawText = response.text;
      break;
    } catch (error) {
      failures.push(`${model}: ${describeError(error)}`);
      if (!canTryAnotherModel(error)) break;
    }
  }
  if (rawText === undefined && failures.length > 0) throw new AssistantUpstreamError(failures.join(" | "));
  if (!rawText) throw new AssistantUpstreamError("Gemini returned an empty response");

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new AssistantUpstreamError("Gemini returned text that is not JSON");
  }
  const result = assistantReplySchema.safeParse(parsed);
  if (!result.success) throw new AssistantUpstreamError("Gemini reply did not match the expected shape");
  return result.data;
}
