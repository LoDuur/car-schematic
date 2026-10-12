# Car Schematic

Explore a car part by part in 3D. Pick the exact configuration, select or search for components, isolate, hide or explode them, follow their connections, read specifications with their sources, save parts, and ask a Gemini assistant that knows the selected configuration.

The first vehicle is the BMW 5 Series E60 / E61. Nothing in the code is BMW-specific: every vehicle is a data package in `vehicles/` that the server reads at runtime.

## Run it

```bash
npm install
cp server/.env.example server/.env   # add GEMINI_API_KEY to enable the assistant
npm run dev:server                   # API on http://localhost:8790
npm run dev:web                      # app on http://localhost:5173
```

Other commands:

| Command | What it does |
| --- | --- |
| `npm test` | Unit tests for rules, filtering, the E60 data and the assistant context |
| `npm run typecheck` | TypeScript check of shared, server and web |
| `npm run validate:data` | Validates every registered vehicle package and lists problems |
| `npm run build` | Production build of the web app into `web/dist` |

Environment variables (`server/.env`):

- `GEMINI_API_KEY`: required for the assistant. Without it the rest of the app works and the assistant says it is off.
- `GEMINI_MODEL`: optional, defaults to `gemini-flash-latest`. Pin a specific model id for stable behaviour.
- `PORT`: API port, default `8790`. If you change it, start the web app with `API_PORT=<port>`.

## Layout

```
shared/    zod schemas, rule engine, configuration filtering, package checks
server/    Hono API: vehicle registry, vehicle packages, model assets, assistant
web/       React + react-three-fiber app
vehicles/  one data package per vehicle, read at runtime
```

## Data accuracy

Every specification, part number and fitment has a status:

- `verified` (shown as "Cited"): matches the source named by `sourceId`. A source is required.
- `unverified` (shown as "Unconfirmed"): widely stated, not yet checked against a cited source.
- `missing`: no reliable value. The app shows "No reliable data" and the assistant is told not to guess it.

The validator rejects a `verified` value without a source and a `missing` value with a value.

## Add a vehicle

1. Create `vehicles/<make>/<model>/` with:
   - `vehicle.json`: identity, configuration `axes` (any number, any names), compatibility `rules`, `defaultConfig`, and vehicle-level `facts`.
   - `systems.json`: the systems used to group parts.
   - `components/*.json`: one or more files, each `{ "components": [...] }`.
   - `sources.json`: every source a `sourceId` points to.
   - `model.map.json`: how each component appears in 3D.
   - `assets/`: optional `.glb` model.
2. Register it in `vehicles/index.json`.
3. Run `npm run validate:data` and fix what it reports. The running server picks the package up within 10 seconds; no rebuild is needed.

### Vehicle hierarchy and configuration

`vehicles/index.json` lists each vehicle with `make`, `model` and `generation`; the configuration dialog builds its Make, Model and Generation pickers from it. Each vehicle declares its own configuration `axes` (any names and any number), so nothing in the app assumes years, engine codes or drivetrains exist. `summaryAxes` in `vehicle.json` chooses which axes the top bar summarises. Options that would force other choices to change are listed under "Changes other options".

### Assemblies and symptoms

- `systems.json` may list `assemblies` (`id`, `systemId`, `name`). A component's `assemblyId` places it in the parts tree as System › Assembly › Part and appears as its parent assembly in the detail panel.
- `symptoms.json` (optional) lists symptoms with names and search aliases. A component's `symptomIds` link it to symptoms it can be involved in. Search, the detail panel and the assistant present these as possible links only, never as a diagnosis.

### Configuration rules

A rule says "when this holds, that must hold":

```json
{ "id": "m5-rear-wheel-drive", "when": { "axis": "model", "in": ["m5"] }, "require": { "axis": "drivetrain", "in": ["rwd"] }, "reason": "The M5 was rear-wheel drive only." }
```

Predicates combine with `all`, `any` and `not`. The same predicate format is used for `appliesWhen` on components, specs, part numbers, relations and documentation links, so a part, value or link only appears for configurations it fits.

### Text and languages

Any text field is either a plain string (language-neutral, such as an engine code) or `{ "en": "...", "lv": "...", "ru": "..." }`. `en` is required. A missing translation falls back to English and is marked in the UI.

### 3D model and mapping

The E60 model is built in Blender by the scripts in `blender/` (see [blender/README.md](blender/README.md)). Each component is a separate mesh named after its component id, so the viewer, search, detail panel and assistant all point at the same part. The model is built for one reference configuration (2006 525i saloon, N52B25, automatic, RWD, left-hand drive). Positions are approximate reconstructions from published dimensions, not factory CAD data.

`model.map.json` uses metres with the origin on the ground at the middle of the wheelbase, `+x` forward, `+y` up and `+z` to the car's right.

Each component maps to:

- `meshes`: node names in the `.glb`. The Blender build fills these in.
- `shapes`: optional boxes, cylinders or spheres, used only if the model fails to load or a component has no mesh.

`glb` names the model file in `assets/`, its credit, the configuration it was built for (`referenceConfig`) and an optional `transform`. When the selected configuration differs from `referenceConfig`, the overview says which options differ. Meshes that no component claims are drawn as the faint body outline.

A part mapping can also list `variants`, each with an `appliesWhen` rule and its own `meshes` or `shapes`. The first matching variant is used, so a configuration can point a component at different geometry without changing the database.

Set `placementStatus` to `measured` only for positions taken from real measurements. Add `explode` to control the exploded-view direction.

## Assistant

`POST /api/assistant` receives the vehicle id, the full configuration, the language, the question, recent history and the selected part. The server:

1. validates the request and the configuration against the vehicle rules,
2. resolves the parts that exist in that configuration,
3. ranks them by relevance to the question and the selected part, and sends up to 40 with their specs and connections,
4. asks Gemini for structured JSON: answer, parts, possible causes with checks, `actions`, data gaps and a safety note,
5. removes any part id that is not in the configuration before replying.

`actions` are requests for the website: `highlight`, `select`, `focus` and `isolate`, each with component ids. The client runs them through the same store functions the UI uses (`web/src/lib/assistantActions.ts`). The server tells Gemini which part is selected, so follow-ups such as "where is this part?" refer to it; the user can untick "Ask about the selected part" to leave it out. Symptoms linked to parts are included as possible links.

Possible causes are always shown as "Not confirmed". The app has no confirmed-diagnosis state.
