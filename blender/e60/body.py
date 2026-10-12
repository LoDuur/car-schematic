import bpy
from mathutils import Vector

from e60 import reference as ref
from e60.assembly import Assembly
from lib.geom import ALONG_Y, ALONG_Z, add_box, add_cylinder, add_lathe, add_loft, place

TOP_PROFILE = [
    (ref.FRONT_END_X, 0.50), (ref.FRONT_END_X - 0.02, 0.63), (2.18, 0.71), (1.90, 0.77), (1.30, 0.86), (0.80, 0.93),
    (0.30, 1.22), (-0.05, 1.41), (-0.45, ref.ROOF_Z), (-1.05, 1.43), (-1.45, 1.24), (-1.78, 1.05), (-2.30, 1.02),
    (-2.48, 0.98), (ref.REAR_END_X, 0.80),
]
BOTTOM_PROFILE = [
    (ref.FRONT_END_X, 0.42), (2.20, 0.26), (2.00, 0.20), (1.70, ref.SILL_Z), (-2.00, ref.SILL_Z), (-2.35, 0.25), (ref.REAR_END_X, 0.45),
]
HALF_WIDTH_PROFILE = [
    (ref.FRONT_END_X, 0.70), (2.20, 0.84), (1.90, 0.905), (1.20, ref.HALF_WIDTH), (-1.60, ref.HALF_WIDTH), (-2.20, 0.90), (-2.50, 0.82), (ref.REAR_END_X, 0.74),
]
BELTLINE_PROFILE = [(ref.FRONT_END_X, 0.70), (0.80, 0.90), (-1.78, 1.00), (ref.REAR_END_X, 1.00)]
ROOF_HALF_WIDTH = 0.60
STATION_COUNT = 72
ARCH_RADIUS = 0.375
ARCH_DEPTH = 0.27


def interpolate(profile, x: float) -> float:
    ordered = sorted(profile)
    if x <= ordered[0][0]:
        return ordered[0][1]
    for (x0, y0), (x1, y1) in zip(ordered, ordered[1:]):
        if x0 <= x <= x1:
            t = (x - x0) / (x1 - x0)
            t = t * t * (3.0 - 2.0 * t)
            return y0 + (y1 - y0) * t
    return ordered[-1][1]


def section_half(x: float):
    bottom = interpolate(BOTTOM_PROFILE, x)
    top = interpolate(TOP_PROFILE, x)
    half_width = interpolate(HALF_WIDTH_PROFILE, x)
    belt = min(interpolate(BELTLINE_PROFILE, x), top)
    greenhouse = max(0.0, min(1.0, (top - belt) / 0.15))
    roof_half = ROOF_HALF_WIDTH * greenhouse + half_width * 0.55 * (1.0 - greenhouse)
    lower_side = belt - 0.04 if greenhouse > 0 else top - 0.07
    shoulder = half_width - 0.035
    greenhouse_base = half_width - 0.05 - 0.07 * greenhouse
    return [
        (0.0, bottom),
        (half_width - 0.07, bottom),
        (half_width - 0.01, bottom + 0.05),
        (half_width, (bottom + lower_side) / 2.0),
        (half_width - 0.004, lower_side),
        (shoulder, lower_side + 0.035),
        (greenhouse_base, lower_side + 0.06 + 0.04 * greenhouse),
        (roof_half + 0.05 * greenhouse + 0.06, top - 0.06),
        (roof_half * 0.72, top - 0.008),
        (0.0, top),
    ]


def section_ring(x: float):
    half = section_half(x)
    left = [Vector((x, y, z)) for y, z in half]
    right = [Vector((x, -y, z)) for y, z in reversed(half[1:-1])]
    return left + right


def apply_boolean_difference(target, cutters):
    for index, cutter in enumerate(cutters):
        modifier = target.modifiers.new(f"arch_{index}", "BOOLEAN")
        modifier.operation = "DIFFERENCE"
        modifier.solver = "EXACT"
        modifier.object = cutter
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = target.evaluated_get(depsgraph)
    new_mesh = bpy.data.meshes.new_from_object(evaluated)
    old_mesh = target.data
    target.modifiers.clear()
    target.data = new_mesh
    new_mesh.materials.clear()
    for slot in old_mesh.materials:
        new_mesh.materials.append(slot)
    bpy.data.meshes.remove(old_mesh)
    for cutter in cutters:
        bpy.data.objects.remove(cutter)


def build_arch_cutters(collection):
    import bmesh

    cutters = []
    for axle_x in (ref.FRONT_AXLE_X, ref.REAR_AXLE_X):
        for side in (1.0, -1.0):
            bm = bmesh.new()
            centre_y = side * (ref.HALF_WIDTH - ARCH_DEPTH / 2.0 + 0.06)
            add_cylinder(bm, ARCH_RADIUS, ARCH_DEPTH + 0.12, place((axle_x, centre_y, ref.WHEEL_CENTRE_Z), ALONG_Y), segments=40)
            mesh = bpy.data.meshes.new("arch_cutter")
            bm.to_mesh(mesh)
            bm.free()
            cutter = bpy.data.objects.new("arch_cutter", mesh)
            collection.objects.link(cutter)
            cutters.append(cutter)
    return cutters


def build_body(assembly: Assembly):
    span = ref.FRONT_END_X - ref.REAR_END_X
    stations = [ref.FRONT_END_X - span * index / (STATION_COUNT - 1) for index in range(STATION_COUNT)]
    with assembly.part("body__shell", "body", "paint", smooth=True) as bm:
        add_loft(bm, [section_ring(x) for x in stations])
    shell = bpy.data.objects["body__shell"]
    apply_boolean_difference(shell, build_arch_cutters(assembly.collection))

    with assembly.part("body__bulkhead", "body", "paint") as bm:
        add_box(bm, (0.012, 1.40, 0.62), place((ref.BULKHEAD_X, 0.0, 0.62)))

    with assembly.part("body__strut-towers", "body", "paint", smooth=True) as bm:
        for side in (1.0, -1.0):
            tower = [(-0.10, 0.0), (-0.10, 0.11), (0.06, 0.09), (0.08, 0.0)]
            add_lathe(bm, tower, 28, place((ref.FRONT_AXLE_X - 0.03, side * 0.585, 0.74), ALONG_Z))

    with assembly.part("body__kidney-grille", "body", "black-plastic") as bm:
        for side in (1.0, -1.0):
            add_box(bm, (0.03, 0.17, 0.12), place((ref.FRONT_END_X - 0.03, side * 0.11, 0.62)), bevel=0.03, bevel_segments=4)
