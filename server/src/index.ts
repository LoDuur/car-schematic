import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { getConnInfo } from "@hono/node-server/conninfo";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { findBrokenRules, isCompleteConfig, languageSchema, vehicleConfigSchema } from "@car-schematic/shared";
import { buildAssistantContext } from "./assistant/context";
import { AssistantNotConfiguredError, AssistantUpstreamError, askGemini, isAssistantConfigured } from "./assistant/gemini";
import { keepKnownComponents } from "./assistant/reply";
import { createRateLimiter } from "./rateLimit";
import { VehicleDataError, loadRegistry, loadVehiclePackage, resolvePackageDirectory } from "./vehicleStore";

const serverSourceDirectory = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(serverSourceDirectory, "../.env");
const webDistDirectory = path.join(serverSourceDirectory, "../../web/dist");
if (existsSync(envPath)) process.loadEnvFile(envPath);

const PORT = Number(process.env.PORT ?? 8790);
const MAX_MESSAGE_LENGTH = 4000;
const MAX_HISTORY_TURNS = 10;
const ASSET_TYPES: Record<string, string> = {
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".bin": "application/octet-stream",
  ".png": "image/png",
  ".jpg": "image/jpeg",
};

const assistantRequestSchema = z.object({
  vehicleId: z.string().min(1).max(100),
  config: vehicleConfigSchema,
  language: languageSchema,
  message: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
  history: z
    .array(z.object({ role: z.enum(["user", "model"]), text: z.string().min(1).max(MAX_MESSAGE_LENGTH) }))
    .max(MAX_HISTORY_TURNS)
    .default([]),
  selectedId: z.string().max(100).optional(),
});

const isAssistantRequestAllowed = createRateLimiter(10, 60_000);

function respondWithDataError(context: Context, error: unknown) {
  if (error instanceof VehicleDataError) {
    console.error(error.message, error.problems);
    return context.json({ error: "vehicle_data_invalid", message: error.message, problems: error.problems }, 500);
  }
  throw error;
}

const app = new Hono();

app.get("/api/vehicles", async (context) => {
  try {
    return context.json({ vehicles: await loadRegistry() });
  } catch (error) {
    return respondWithDataError(context, error);
  }
});

app.get("/api/vehicles/:id", async (context) => {
  try {
    const vehiclePackage = await loadVehiclePackage(context.req.param("id"));
    if (!vehiclePackage) return context.json({ error: "vehicle_not_found" }, 404);
    return context.json(vehiclePackage);
  } catch (error) {
    return respondWithDataError(context, error);
  }
});

app.get("/api/vehicles/:id/assets/:file", async (context) => {
  const fileName = context.req.param("file");
  const contentType = ASSET_TYPES[path.extname(fileName).toLowerCase()];
  if (!/^[\w.-]+$/.test(fileName) || !contentType) return context.json({ error: "asset_not_found" }, 404);
  try {
    const entry = (await loadRegistry()).find((candidate) => candidate.id === context.req.param("id"));
    if (!entry) return context.json({ error: "vehicle_not_found" }, 404);
    const file = await readFile(path.join(resolvePackageDirectory(entry), "assets", fileName));
    return context.body(file, 200, { "Content-Type": contentType, "Cache-Control": "public, max-age=3600" });
  } catch (error) {
    if (error instanceof VehicleDataError) return respondWithDataError(context, error);
    return context.json({ error: "asset_not_found" }, 404);
  }
});

app.get("/api/assistant/status", (context) => context.json({ configured: isAssistantConfigured() }));

app.post("/api/assistant", bodyLimit({ maxSize: 64 * 1024 }), async (context) => {
  const clientAddress = getConnInfo(context).remote.address ?? "unknown";
  if (!isAssistantRequestAllowed(clientAddress)) {
    return context.json({ error: "rate_limited", message: "Too many questions. Wait a minute and try again." }, 429);
  }

  const parsed = assistantRequestSchema.safeParse(await context.req.json().catch(() => null));
  if (!parsed.success) return context.json({ error: "invalid_request", issues: parsed.error.issues }, 400);
  const request = parsed.data;

  try {
    const vehiclePackage = await loadVehiclePackage(request.vehicleId);
    if (!vehiclePackage) return context.json({ error: "vehicle_not_found" }, 404);
    if (!isCompleteConfig(vehiclePackage.vehicle.axes, request.config)) {
      return context.json({ error: "invalid_config", message: "Every configuration option must be selected." }, 400);
    }
    const brokenRules = findBrokenRules(vehiclePackage.vehicle.rules, request.config);
    if (brokenRules.length > 0) {
      return context.json({ error: "invalid_config", message: "This combination does not exist.", rules: brokenRules.map((rule) => rule.id) }, 400);
    }

    const assistantContext = buildAssistantContext(vehiclePackage, request.config, request.language, request.message, request.selectedId);
    const reply = await askGemini(assistantContext, request.history, request.message);
    return context.json(keepKnownComponents(reply, new Set(assistantContext.allowedComponentIds)));
  } catch (error) {
    if (error instanceof AssistantNotConfiguredError) {
      return context.json({ error: "assistant_not_configured", message: "The assistant has no Gemini API key. Add GEMINI_API_KEY to server/.env." }, 503);
    }
    if (error instanceof AssistantUpstreamError) {
      console.error("Gemini request failed:", error.message);
      return context.json({ error: "assistant_failed", message: "The assistant could not answer. Try again." }, 502);
    }
    return respondWithDataError(context, error);
  }
});

app.all("/api/*", (context) => context.json({ error: "not_found" }, 404));

if (existsSync(path.join(webDistDirectory, "index.html"))) {
  const webDistRoot = path.relative(process.cwd(), webDistDirectory);
  app.use("*", serveStatic({ root: webDistRoot }));
  app.get("*", serveStatic({ root: webDistRoot, path: "index.html" }));
}

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`API listening on http://localhost:${info.port}`);
});
