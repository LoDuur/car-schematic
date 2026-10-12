import math

from mathutils import Matrix, Vector

from e60 import reference as ref
from e60.assembly import Assembly
from lib.geom import ALONG_X, ALONG_Y, ALONG_Z, add_box, add_cylinder, add_lathe, add_prism, add_sweep, align_x, place, smooth_path

ENGINE_FRAME = Matrix.Translation((ref.ENGINE_CENTRE_X, 0.0, ref.CRANK_Z)) @ Matrix.Rotation(math.radians(ref.ENGINE_TILT), 4, "X")
HALF_LENGTH = ref.BLOCK_LENGTH / 2.0
DECK_HEIGHT = 0.215
HEAD_TOP = 0.335
CAM_COVER_TOP = 0.395
FRONT_FACE = HALF_LENGTH + 0.03
BELT_PLANE = FRONT_FACE + 0.035
SECTION_TO_ALONG_U = Matrix(((0.0, 0.0, 1.0, 0.0), (1.0, 0.0, 0.0, 0.0), (0.0, 1.0, 0.0, 0.0), (0.0, 0.0, 0.0, 1.0)))

BLOCK_SECTION = [(-0.150, -0.105), (0.150, -0.105), (0.155, 0.000), (0.112, 0.095), (0.104, DECK_HEIGHT), (-0.104, DECK_HEIGHT), (-0.112, 0.095), (-0.155, 0.000)]
HEAD_SECTION = [(-0.116, DECK_HEIGHT), (0.116, DECK_HEIGHT), (0.126, 0.285), (0.120, HEAD_TOP), (-0.120, HEAD_TOP), (-0.126, 0.285)]
CAM_COVER_SECTION = [(-0.112, HEAD_TOP), (0.112, HEAD_TOP), (0.104, 0.372), (0.062, CAM_COVER_TOP), (-0.062, CAM_COVER_TOP), (-0.104, 0.372)]

INTAKE_SIDE = 1.0
EXHAUST_SIDE = -1.0
PULLEYS = {
    "crank": ((0.0, 0.0), 0.088),
    "alternator": ((0.165, 0.175), 0.030),
    "power-steering": ((-0.150, 0.105), 0.060),
    "tensioner": ((0.105, 0.070), 0.035),
    "idler": ((-0.040, 0.150), 0.033),
}


def engine_matrix(location=(0.0, 0.0, 0.0), rotation=(0.0, 0.0, 0.0), scale=(1.0, 1.0, 1.0)) -> Matrix:
    return ENGINE_FRAME @ place(location, rotation, scale)


def engine_point(u: float, v: float, w: float) -> Vector:
    return ENGINE_FRAME @ Vector((u, v, w))


def cylinder_u(index: int) -> float:
    first = HALF_LENGTH - 0.0375 - ref.BORE_SPACING / 2.0
    return first - index * ref.BORE_SPACING


def section_prism(bm, section, u_from: float, u_to: float):
    depth = u_to - u_from
    centre = (u_from + u_to) / 2.0
    add_prism(bm, section, depth, ENGINE_FRAME @ Matrix.Translation((centre, 0.0, 0.0)) @ SECTION_TO_ALONG_U)


def engine_sweep(bm, local_points, radius, segments=12, subdivisions=6):
    world = [engine_point(*point) for point in local_points]
    return add_sweep(bm, smooth_path(world, subdivisions), radius, segments)


def build_block(assembly: Assembly):
    with assembly.part("engine-block", "engine", "aluminium") as bm:
        section_prism(bm, BLOCK_SECTION, -HALF_LENGTH, HALF_LENGTH)
        timing_case = [(-0.118, -0.06), (0.118, -0.06), (0.125, 0.20), (0.110, HEAD_TOP + 0.02), (-0.110, HEAD_TOP + 0.02), (-0.125, 0.20)]
        section_prism(bm, timing_case, HALF_LENGTH, FRONT_FACE)
        add_box(bm, (0.012, 0.44, 0.40), engine_matrix((-HALF_LENGTH - 0.006, 0.0, 0.03)), bevel=0.05, bevel_segments=3)
        for bearing in range(7):
            u = HALF_LENGTH - 0.0375 - bearing * ref.BORE_SPACING + 0.0
            for side in (1.0, -1.0):
                add_box(bm, (0.012, 0.012, 0.18), engine_matrix((u, side * 0.152, -0.01), (side * 0.25, 0.0, 0.0)))
        for side in (1.0, -1.0):
            add_box(bm, (0.10, 0.05, 0.06), engine_matrix((0.04, side * 0.175, -0.01)), bevel=0.01)
        add_cylinder(bm, 0.030, 0.03, engine_matrix((FRONT_FACE + 0.005, 0.0, 0.0)), segments=20)


def build_oil_pan(assembly: Assembly):
    shallow_from = ref.FRONT_AXLE_X - 0.10
    with assembly.part("oil-pan", "engine", "aluminium") as bm:
        add_box(bm, (ref.BLOCK_FRONT_X - shallow_from, 0.30, 0.10), place(((ref.BLOCK_FRONT_X + shallow_from) / 2.0, 0.0, 0.335)), bevel=0.02)
        deep_length = shallow_from - ref.BLOCK_REAR_X
        add_box(bm, (deep_length, 0.31, 0.19), place(((shallow_from + ref.BLOCK_REAR_X) / 2.0, -0.01, 0.285)), bevel=0.03, bevel_segments=3)
        add_cylinder(bm, 0.012, 0.02, place((ref.BLOCK_REAR_X + 0.10, -0.02, 0.185), ALONG_Z), segments=12)


def build_cylinder_head(assembly: Assembly):
    with assembly.part("cylinder-head", "engine", "aluminium") as bm:
        section_prism(bm, HEAD_SECTION, -HALF_LENGTH + 0.005, HALF_LENGTH)
        section_prism(bm, CAM_COVER_SECTION, -HALF_LENGTH + 0.015, HALF_LENGTH - 0.005)
        add_cylinder(bm, 0.024, 0.03, engine_matrix((cylinder_u(1), -0.06, CAM_COVER_TOP - 0.005), ALONG_Z), segments=20, chamfer=0.004)
        for index in range(ref.CYLINDER_COUNT):
            port_u = cylinder_u(index)
            add_box(bm, (0.05, 0.03, 0.04), engine_matrix((port_u, INTAKE_SIDE * 0.125, 0.268)), bevel=0.008)
            add_box(bm, (0.045, 0.03, 0.035), engine_matrix((port_u, EXHAUST_SIDE * 0.125, 0.262)), bevel=0.008)


def build_valve_actuators(assembly: Assembly):
    with assembly.part("valvetronic-motor", "engine", "black-plastic", smooth=True) as bm:
        add_cylinder(bm, 0.028, 0.085, engine_matrix((-HALF_LENGTH + 0.12, INTAKE_SIDE * 0.165, 0.315), ALONG_Y), segments=24, chamfer=0.004)
        add_box(bm, (0.06, 0.02, 0.06), engine_matrix((-HALF_LENGTH + 0.12, INTAKE_SIDE * 0.118, 0.315)), bevel=0.006)
        add_box(bm, (0.025, 0.02, 0.018), engine_matrix((-HALF_LENGTH + 0.12, INTAKE_SIDE * 0.20, 0.34)))
    with assembly.part("vanos-solenoids", "engine", "black-plastic", smooth=True) as bm:
        for side in (1.0, -1.0):
            centre = (FRONT_FACE + 0.025, side * 0.055, 0.30)
            add_cylinder(bm, 0.016, 0.05, engine_matrix(centre, ALONG_X), segments=20, chamfer=0.003)
            add_box(bm, (0.02, 0.022, 0.018), engine_matrix((FRONT_FACE + 0.055, side * 0.055, 0.312)))


def build_lubrication_parts(assembly: Assembly):
    housing_base = engine_point(0.17, INTAKE_SIDE * 0.20, 0.02)
    with assembly.part("oil-filter-housing", "engine", "aluminium", smooth=True) as bm:
        profile = [(-0.09, 0.0), (-0.09, 0.050), (-0.07, 0.048), (0.05, 0.048), (0.055, 0.052), (0.075, 0.052), (0.08, 0.035), (0.08, 0.0)]
        add_lathe(bm, profile, 28, place(housing_base + Vector((0.0, 0.0, 0.07)), ALONG_Z))
        add_box(bm, (0.10, 0.06, 0.05), place(housing_base + Vector((0.0, -0.045, -0.03))), bevel=0.01)
    with assembly.part("crankshaft-sensor", "engine", "black-plastic", smooth=True) as bm:
        add_cylinder(bm, 0.010, 0.05, engine_matrix((-HALF_LENGTH + 0.05, INTAKE_SIDE * 0.168, -0.035), ALONG_Y), segments=16)
        add_box(bm, (0.018, 0.022, 0.016), engine_matrix((-HALF_LENGTH + 0.05, INTAKE_SIDE * 0.20, -0.035)))


def build_intake(assembly: Assembly):
    plenum_v, plenum_w = INTAKE_SIDE * 0.330, 0.160
    with assembly.part("intake-manifold", "intake", "black-plastic", smooth=True) as bm:
        plenum_path = [(-HALF_LENGTH + 0.05, plenum_v, plenum_w), (0.0, plenum_v, plenum_w), (HALF_LENGTH - 0.02, plenum_v, plenum_w)]
        engine_sweep(bm, plenum_path, 0.062, segments=20, subdivisions=4)
        for index in range(ref.CYLINDER_COUNT):
            u = cylinder_u(index)
            runner = [(u, INTAKE_SIDE * 0.135, 0.268), (u, INTAKE_SIDE * 0.215, 0.330), (u, INTAKE_SIDE * 0.305, 0.300), (u, INTAKE_SIDE * 0.345, 0.215), (u, plenum_v, plenum_w + 0.02)]
            engine_sweep(bm, runner, 0.021, segments=12, subdivisions=5)
    with assembly.part("throttle-body", "intake", "aluminium", smooth=True) as bm:
        centre = (HALF_LENGTH + 0.025, plenum_v, plenum_w)
        add_cylinder(bm, 0.043, 0.07, engine_matrix(centre, ALONG_X), segments=28, chamfer=0.005)
        add_box(bm, (0.05, 0.035, 0.05), engine_matrix((centre[0], plenum_v + INTAKE_SIDE * 0.05, plenum_w + 0.02)), bevel=0.006)
    airbox_centre = Vector((ref.FRONT_AXLE_X + 0.42, 0.40, 0.70))
    with assembly.part("air-filter-housing", "intake", "black-plastic", smooth=True) as bm:
        add_box(bm, (0.30, 0.32, 0.17), place(airbox_centre), bevel=0.03, bevel_segments=3)
        add_box(bm, (0.30, 0.33, 0.012), place(airbox_centre + Vector((0.0, 0.0, 0.03))), bevel=0.004)
        throttle_inlet = engine_point(HALF_LENGTH + 0.07, plenum_v, plenum_w)
        duct = [airbox_centre + Vector((-0.15, -0.06, -0.02)), airbox_centre + Vector((-0.24, -0.10, -0.08)), throttle_inlet + Vector((0.12, 0.02, 0.05)), throttle_inlet]
        add_sweep(bm, smooth_path(duct, 8), 0.042, segments=20)
        snorkel = [airbox_centre + Vector((0.15, 0.04, 0.02)), airbox_centre + Vector((0.30, 0.02, 0.0)), Vector((ref.FRONT_END_X - 0.06, 0.38, 0.70))]
        add_sweep(bm, smooth_path(snorkel, 6), 0.04, segments=16)


def build_fuel_injection(assembly: Assembly):
    rail_v, rail_w = INTAKE_SIDE * 0.185, 0.330
    with assembly.part("fuel-injectors", "fuel", "steel", smooth=True) as bm:
        engine_sweep(bm, [(-HALF_LENGTH + 0.04, rail_v, rail_w), (HALF_LENGTH - 0.03, rail_v, rail_w)], 0.009, segments=12, subdivisions=2)
        for index in range(ref.CYLINDER_COUNT):
            u = cylinder_u(index)
            top = engine_point(u, rail_v - INTAKE_SIDE * 0.005, rail_w - 0.012)
            nozzle = engine_point(u, INTAKE_SIDE * 0.150, 0.282)
            body_length = (top - nozzle).length
            add_cylinder(bm, 0.0075, body_length, align_x((top + nozzle) / 2.0, top - nozzle), segments=12)


def build_ignition(assembly: Assembly):
    with assembly.part("ignition-coils", "ignition", "black-plastic", smooth=True) as bm:
        for index in range(ref.CYLINDER_COUNT):
            u = cylinder_u(index)
            add_cylinder(bm, 0.017, 0.10, engine_matrix((u, 0.0, CAM_COVER_TOP - 0.03), ALONG_Z), segments=16)
            add_box(bm, (0.035, 0.045, 0.028), engine_matrix((u, 0.008, CAM_COVER_TOP + 0.032)), bevel=0.005)
    with assembly.part("spark-plugs", "ignition", "steel", smooth=True) as bm:
        for index in range(ref.CYLINDER_COUNT):
            u = cylinder_u(index)
            add_cylinder(bm, 0.007, 0.075, engine_matrix((u, 0.0, 0.262), ALONG_Z), segments=12)
            add_cylinder(bm, 0.0105, 0.012, engine_matrix((u, 0.0, 0.285), ALONG_Z), segments=6)


def belt_path():
    samples = []
    for (v, w), radius in PULLEYS.values():
        for step in range(48):
            angle = 2.0 * math.pi * step / 48
            samples.append((v + (radius + 0.004) * math.cos(angle), w + (radius + 0.004) * math.sin(angle)))
    samples.sort()
    lower, upper = [], []
    for point in samples:
        while len(lower) >= 2 and _cross(lower[-2], lower[-1], point) <= 0:
            lower.pop()
        lower.append(point)
    for point in reversed(samples):
        while len(upper) >= 2 and _cross(upper[-2], upper[-1], point) <= 0:
            upper.pop()
        upper.append(point)
    hull = lower[:-1] + upper[:-1]
    return [engine_point(BELT_PLANE, v, w) for v, w in hull + hull[:1]]


def _cross(origin, first, second):
    return (first[0] - origin[0]) * (second[1] - origin[1]) - (first[1] - origin[1]) * (second[0] - origin[0])


def pulley_profile(radius: float, width: float):
    half = width / 2.0
    return [(-half, 0.0), (-half, radius), (-half + 0.003, radius - 0.004), (half - 0.003, radius - 0.004), (half, radius), (half, 0.0)]


def build_belt_drive(assembly: Assembly):
    with assembly.part("accessory-belt-drive", "engine", "rubber", smooth=True) as bm:
        add_sweep(bm, belt_path(), 0.004, segments=6, cap=False)
        for name in ("crank", "tensioner", "idler"):
            (v, w), radius = PULLEYS[name]
            add_lathe(bm, pulley_profile(radius, 0.028), 32, engine_matrix((BELT_PLANE, v, w), ALONG_X))
        (v, w), _ = PULLEYS["crank"]
        add_cylinder(bm, 0.075, 0.03, engine_matrix((BELT_PLANE - 0.022, v, w), ALONG_X), segments=32)
        (v, w), _ = PULLEYS["tensioner"]
        add_box(bm, (0.02, 0.03, 0.09), engine_matrix((BELT_PLANE - 0.02, v - 0.02, w - 0.04), (0.6, 0.0, 0.0)), bevel=0.006)


def build_belt_driven_units(assembly: Assembly):
    (alt_v, alt_w), alt_radius = PULLEYS["alternator"]
    with assembly.part("alternator", "electrical", "aluminium", smooth=True) as bm:
        add_lathe(bm, pulley_profile(alt_radius, 0.028), 24, engine_matrix((BELT_PLANE, alt_v, alt_w), ALONG_X))
        body = [(-0.075, 0.0), (-0.075, 0.068), (-0.06, 0.076), (0.06, 0.076), (0.07, 0.07), (0.07, 0.0)]
        add_lathe(bm, body, 32, engine_matrix((BELT_PLANE - 0.09, alt_v, alt_w), ALONG_X))
        add_box(bm, (0.12, 0.03, 0.03), engine_matrix((BELT_PLANE - 0.09, alt_v - 0.08, alt_w - 0.03)), bevel=0.005)
    (ps_v, ps_w), ps_radius = PULLEYS["power-steering"]
    with assembly.part("power-steering-pump", "steering", "aluminium", smooth=True) as bm:
        add_lathe(bm, pulley_profile(ps_radius, 0.026), 32, engine_matrix((BELT_PLANE, ps_v, ps_w), ALONG_X))
        add_cylinder(bm, 0.05, 0.10, engine_matrix((BELT_PLANE - 0.075, ps_v, ps_w), ALONG_X), segments=28, chamfer=0.006)
        add_box(bm, (0.06, 0.05, 0.05), engine_matrix((BELT_PLANE - 0.12, ps_v + 0.01, ps_w + 0.05)), bevel=0.008)


def build_engine_cooling_parts(assembly: Assembly):
    with assembly.part("coolant-pump", "cooling", "black-plastic", smooth=True) as bm:
        add_cylinder(bm, 0.048, 0.11, engine_matrix((FRONT_FACE - 0.02, INTAKE_SIDE * 0.150, -0.045), ALONG_X), segments=28, chamfer=0.006)
        add_lathe(bm, [(-0.02, 0.0), (-0.02, 0.06), (0.02, 0.06), (0.02, 0.0)], 28, engine_matrix((FRONT_FACE + 0.045, INTAKE_SIDE * 0.150, -0.045), ALONG_X))
        add_box(bm, (0.03, 0.03, 0.02), engine_matrix((FRONT_FACE - 0.07, INTAKE_SIDE * 0.20, -0.02)))
    with assembly.part("thermostat", "cooling", "black-plastic", smooth=True) as bm:
        add_cylinder(bm, 0.038, 0.05, engine_matrix((FRONT_FACE + 0.035, INTAKE_SIDE * 0.150, 0.065), ALONG_X), segments=24, chamfer=0.005)
        add_box(bm, (0.04, 0.045, 0.06), engine_matrix((FRONT_FACE + 0.01, INTAKE_SIDE * 0.150, 0.03)), bevel=0.006)
        add_box(bm, (0.012, 0.02, 0.025), engine_matrix((FRONT_FACE + 0.065, INTAKE_SIDE * 0.150, 0.10)))


def build_mounts_and_starter(assembly: Assembly):
    with assembly.part("engine-mounts", "engine", "rubber", smooth=True) as bm:
        for side in (1.0, -1.0):
            mount_centre = Vector((ref.ENGINE_CENTRE_X + 0.04, side * 0.30, 0.255))
            add_cylinder(bm, 0.042, 0.065, place(mount_centre, ALONG_Z), segments=24, chamfer=0.006)
            arm_start = engine_point(0.04, side * 0.19, -0.01)
            arm = [arm_start, (arm_start + mount_centre) / 2.0 + Vector((0.0, 0.0, 0.02)), mount_centre + Vector((0.0, 0.0, 0.035))]
            add_sweep(bm, smooth_path(arm, 4), 0.016, segments=10)
    starter_centre = Vector((ref.BLOCK_REAR_X - 0.05, INTAKE_SIDE * 0.175, 0.32))
    with assembly.part("starter", "electrical", "steel", smooth=True) as bm:
        add_cylinder(bm, 0.042, 0.16, place(starter_centre, ALONG_X), segments=24, chamfer=0.006)
        add_cylinder(bm, 0.022, 0.12, place(starter_centre + Vector((0.0, -0.045, 0.045)), ALONG_X), segments=16, chamfer=0.004)
        add_box(bm, (0.03, 0.06, 0.08), place(starter_centre + Vector((-0.075, -0.03, 0.0))), bevel=0.006)


def build_engine(assembly: Assembly):
    build_block(assembly)
    build_oil_pan(assembly)
    build_cylinder_head(assembly)
    build_valve_actuators(assembly)
    build_lubrication_parts(assembly)
    build_intake(assembly)
    build_fuel_injection(assembly)
    build_ignition(assembly)
    build_belt_drive(assembly)
    build_belt_driven_units(assembly)
    build_engine_cooling_parts(assembly)
    build_mounts_and_starter(assembly)
