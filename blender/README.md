# Vehicle models (Blender)

The 3D models are built by Python scripts in Blender, not downloaded. Every component is its own named mesh, and the mesh name is the component id in the vehicle database, so selection, search, the detail panel and the assistant all refer to the same part.

## Build

```bash
BLENDER="/path/to/Blender" ./blender/build.sh                  # GLB, build manifest, model map sync
BLENDER="/path/to/Blender" ./blender/build.sh --previews blender/previews --xray
BLENDER="/path/to/Blender" ./blender/build.sh --blend blender/e60.blend
```

Blender 4.2 or newer is required (developed with 5.2). The build:

1. runs `build_e60.py` headless and writes `vehicles/bmw/e60/assets/e60-525i-n52.glb`,
2. writes `vehicles/bmw/e60/model.build.json` with the reference configuration, every measure with its status and source, and each part's system, triangle count and bounds,
3. runs `sync_model_map.mjs`, which points each component in `model.map.json` at its mesh and fails if a mesh has no matching component.

`npm test` checks that every part fitted to the reference configuration has a mesh and that every mesh name is a component id or a `body__` part.

## Reference configuration

The E60 model is built for one configuration:

**2006 BMW 525i saloon (E60), N52B25 inline-six, 6-speed Steptronic automatic, rear-wheel drive, left-hand drive, 225/55 R16 tyres on 7J x 16 wheels.**

Parts that never occur in this configuration (turbocharger, intercooler, high-pressure pump, glow plugs, diesel particulate filter, clutch, transfer case, front differential) are also modelled, as generic geometry placed where they would sit relative to this engine and gearbox. The app shows them only for configurations that have them, and the overview warns when the selected configuration differs from the reference.

## What is verified and what is approximate

Verified values are taken from a cited source and stored in `e60/reference.py` with that source.

| Measure | Value | Source |
| --- | --- | --- |
| Length / width / height | 4,841 / 1,846 / 1,468 mm | BMW press sheet "Specifications BMW 5 Series Saloon", valid from 2005 |
| Wheelbase | 2,888 mm | same |
| Track front / rear | 1,558 / 1,582 mm | same |
| Tyres and wheels | 225/55 R16, 7J x 16 (rolling radius computed: 327 mm) | same |
| Rear brake disc | 320 x 20 mm, vented | same |
| Fuel tank | approx. 70 L (modelled outer volume measured in Blender: about 70 L) | same |
| Bore x stroke | 82 x 78.8 mm | Wikipedia, BMW N52 |
| Front axle | double-joint spring strut axle in aluminium | BMW press sheet |
| Rear axle | Integral IV multi-arm axle in aluminium | BMW press sheet |

Unconfirmed or approximate:

- **Front brake disc 324 x 30 mm**: the press sheet columns are misaligned, and a 2004 sheet lists 310 x 24 mm for the earlier 525i.
- **Front overhang (840 mm), ground clearance, bore spacing (91 mm), 30° engine lean**: estimates, not checked against a source.
- **All component positions and shapes**: reconstructed from the dimensions above and general BMW layout knowledge (intake on the left, exhaust on the right, engine behind the front axle, gearbox in the tunnel, saddle tank ahead of the rear axle, battery in the boot). They have not been checked against photographs, workshop diagrams or CAD data.
- **Body shell**: a lofted approximation of the E60 silhouette for context. It is not a styling-accurate surface and has minor self-intersections at the rear window.
- **Exhaust routing, fuel line routing, tailpipe layout, DSC unit and ECU positions**: schematic.

The app marks every 3D position as approximate.

## Coordinate frame

Blender: +X forward, +Y left, +Z up, in metres, with the origin on the ground at mid-wheelbase. The glTF exporter converts this to +X forward, +Y up, +Z right, which is the frame `model.map.json` and the web viewer use. No transform is needed in the map.

## Structure

```
blender/
  build.sh              entry point
  build_e60.py          scene reset, builders, manifest, GLB export, previews
  sync_model_map.mjs    keeps vehicles/<vehicle>/model.map.json in step with the build
  lib/geom.py           vehicle-independent mesh helpers: lathe, sweep, loft, prism, bevelled box, coil spring
  e60/
    reference.py        reference configuration, measures with sources, layout constants
    assembly.py         part builder: one mesh per component, grouped under system__<id> empties
    body.py             body shell, bulkhead, strut towers, grille
    engine.py           block, head, valvetrain actuators, intake, injection, ignition, belt drive, mounts, starter
    cooling_exhaust.py  radiator, fan, hoses, manifold, catalysts, sensors, exhaust system
    driveline.py        gearbox, propeller shaft, differential, drive shafts, xDrive and clutch parts
    chassis.py          wheels, brakes, front and rear axles, steering
    systems.py          fuel, brake hydraulics, battery, control units, other-variant engine parts
```

## Adding a configuration or a vehicle

- **Another E60 configuration** (for example the Touring body or an N62 V8): add a builder variant that reads its own measures, export it as a second GLB, and extend the model map to choose a GLB per configuration. Component ids stay the same, so the database and the app do not change.
- **Another vehicle**: create `blender/<vehicle>/` with its own `reference.py` and builders, reuse `lib/geom.py` and `assembly.py`, add a `build_<vehicle>.py` entry, and name every mesh after a component id in `vehicles/<make>/<model>/components/`. Run `sync_model_map.mjs` against that vehicle folder.
