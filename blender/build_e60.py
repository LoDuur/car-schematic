import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

BLENDER_DIRECTORY = Path(__file__).resolve().parent
sys.path.insert(0, str(BLENDER_DIRECTORY))

from e60 import reference as ref  # noqa: E402
from e60.assembly import Assembly  # noqa: E402
from e60.body import build_body  # noqa: E402
from e60.engine import build_engine  # noqa: E402
from e60.cooling_exhaust import build_cooling_and_exhaust  # noqa: E402
from e60.driveline import build_driveline  # noqa: E402
from e60.chassis import build_chassis  # noqa: E402
from e60.systems import build_supporting_systems  # noqa: E402

BUILDERS = [build_body, build_engine, build_cooling_and_exhaust, build_driveline, build_chassis, build_supporting_systems]

PREVIEW_VIEWS = {
    "three-quarter-front": ((5.2, -4.4, 2.6), (0.3, 0.0, 0.55)),
    "side-left": ((0.0, 8.5, 0.9), (0.0, 0.0, 0.7)),
    "top": ((0.0, 0.0, 9.0), (0.0, 0.0, 0.0)),
    "engine-bay": ((2.6, -1.6, 2.0), (1.2, 0.0, 0.5)),
    "front-section": ((1.25, -5.5, 0.55), (1.25, 0.0, 0.55)),
    "rear-axle": ((-3.4, -2.2, 1.1), (-1.4, 0.0, 0.35)),
}


def parse_arguments():
    arguments = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--glb", required=True)
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--blend")
    parser.add_argument("--previews")
    parser.add_argument("--hide", default="")
    parser.add_argument("--xray", action="store_true")
    return parser.parse_args(arguments)


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def world_bounds(target):
    corners = [target.matrix_world @ Vector(corner) for corner in target.bound_box]
    return [min(corner[axis] for corner in corners) for axis in range(3)], [max(corner[axis] for corner in corners) for axis in range(3)]


def write_manifest(assembly: Assembly, path: Path):
    parts = {}
    for name in assembly.part_names:
        target = bpy.data.objects[name]
        minimum, maximum = world_bounds(target)
        parts[name] = {
            "system": target.parent.name.removeprefix("system__"),
            "triangles": sum(len(polygon.vertices) - 2 for polygon in target.data.polygons),
            "boundsMin": [round(value, 4) for value in minimum],
            "boundsMax": [round(value, 4) for value in maximum],
        }
    manifest = {
        "referenceConfig": ref.REFERENCE_CONFIG,
        "referenceDescription": ref.REFERENCE_DESCRIPTION,
        "coordinateFrame": "Blender: +X forward, +Y left, +Z up, metres, origin on the ground at mid-wheelbase. glTF export converts to +X forward, +Y up, +Z right.",
        "layoutNote": ref.APPROXIMATE_LAYOUT_NOTE,
        "measures": {key: {"value": measure.value, "status": measure.status, "source": measure.source, "note": measure.note} for key, measure in ref.MEASURES.items()},
        "parts": parts,
    }
    path.write_text(json.dumps(manifest, indent=2) + "\n")


def export_glb(assembly: Assembly, path: Path):
    bpy.ops.object.select_all(action="DESELECT")
    for target in assembly.collection.objects:
        target.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_extras=False,
        export_animations=False,
        export_cameras=False,
        export_lights=False,
    )


def render_previews(directory: Path, hidden_prefixes: list[str], is_xray: bool):
    directory.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "MATERIAL"
    scene.display.shading.show_cavity = True
    scene.display.shading.show_object_outline = True
    scene.display.shading.show_xray = is_xray
    scene.display.shading.xray_alpha = 0.35
    scene.render.resolution_x = 1400
    scene.render.resolution_y = 900
    scene.render.film_transparent = False
    world = bpy.data.worlds.new("preview_world")
    world.color = (0.96, 0.96, 0.95)
    scene.world = world
    for target in bpy.data.objects:
        if any(target.name.startswith(prefix) for prefix in hidden_prefixes if prefix):
            target.hide_render = True
    camera_data = bpy.data.cameras.new("preview_camera")
    camera_data.lens = 50
    camera = bpy.data.objects.new("preview_camera", camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    for view_name, (location, target_point) in PREVIEW_VIEWS.items():
        camera.location = location
        direction = Vector(target_point) - Vector(location)
        camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
        if view_name == "top":
            camera.rotation_euler = (0.0, 0.0, -math.pi / 2.0)
        scene.render.filepath = str(directory / f"{view_name}.png")
        bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(camera)


def main():
    arguments = parse_arguments()
    reset_scene()
    assembly = Assembly("bmw-e60-525i-n52b25")
    for builder in BUILDERS:
        builder(assembly)
    write_manifest(assembly, Path(arguments.manifest))
    export_glb(assembly, Path(arguments.glb))
    if arguments.blend:
        bpy.ops.wm.save_as_mainfile(filepath=str(Path(arguments.blend)))
    if arguments.previews:
        render_previews(Path(arguments.previews), arguments.hide.split(","), arguments.xray)
    print(f"BUILD_OK parts={len(assembly.part_names)}")


main()
