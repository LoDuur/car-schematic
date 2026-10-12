import math

from mathutils import Euler, Matrix, Vector

from e60 import reference as ref
from e60.assembly import Assembly
from e60.engine import EXHAUST_SIDE, FRONT_FACE, INTAKE_SIDE, cylinder_u, engine_point
from lib.geom import ALONG_X, ALONG_Z, add_box, add_cylinder, add_lathe, add_sweep, place, smooth_path

RADIATOR_X = ref.FRONT_END_X - 0.19
RADIATOR_HALF_WIDTH = 0.33
RADIATOR_BOTTOM, RADIATOR_TOP = 0.30, 0.70
FAN_X = RADIATOR_X - 0.075
CAT_FRONT_CENTRE = Vector((0.93, -0.275, 0.30))
CAT_REAR_CENTRE = Vector((0.90, -0.165, 0.225))
CAT_LENGTH = 0.24


def build_radiator(assembly: Assembly):
    core_height = RADIATOR_TOP - RADIATOR_BOTTOM
    centre_z = (RADIATOR_TOP + RADIATOR_BOTTOM) / 2.0
    with assembly.part("radiator", "cooling", "aluminium") as bm:
        add_box(bm, (0.032, 2 * RADIATOR_HALF_WIDTH, core_height), place((RADIATOR_X, 0.0, centre_z)))
        for fin in range(1, 16):
            z = RADIATOR_BOTTOM + core_height * fin / 16.0
            add_box(bm, (0.036, 2 * RADIATOR_HALF_WIDTH - 0.01, 0.003), place((RADIATOR_X, 0.0, z)))
        for side in (1.0, -1.0):
            add_box(bm, (0.05, 0.05, core_height + 0.04), place((RADIATOR_X, side * (RADIATOR_HALF_WIDTH + 0.025), centre_z)), bevel=0.01)
            add_cylinder(bm, 0.018, 0.04, place((RADIATOR_X - 0.035, side * (RADIATOR_HALF_WIDTH + 0.025), RADIATOR_TOP - 0.03 if side > 0 else RADIATOR_BOTTOM + 0.03), ALONG_X), segments=16)


def build_fan(assembly: Assembly):
    centre = Vector((FAN_X, 0.0, (RADIATOR_TOP + RADIATOR_BOTTOM) / 2.0))
    with assembly.part("electric-fan", "cooling", "black-plastic", smooth=True) as bm:
        shroud = [(-0.03, 0.235), (-0.03, 0.25), (0.03, 0.25), (0.03, 0.235), (-0.03, 0.235)]
        add_lathe(bm, shroud, 48, place(centre, ALONG_X))
        add_cylinder(bm, 0.06, 0.07, place(centre + Vector((-0.02, 0.0, 0.0)), ALONG_X), segments=28, chamfer=0.01)
        for blade in range(7):
            angle = 2.0 * math.pi * blade / 7
            blade_centre = centre + Vector((0.0, 0.14 * math.cos(angle), 0.14 * math.sin(angle)))
            add_box(bm, (0.008, 0.055, 0.16), blade_matrix(blade_centre, angle))


def blade_matrix(blade_centre: Vector, angle: float) -> Matrix:
    radial = Euler((angle - math.pi / 2.0, 0.0, 0.0)).to_matrix().to_4x4()
    return Matrix.Translation(blade_centre) @ radial @ Matrix.Rotation(0.45, 4, "Z")


def build_expansion_tank(assembly: Assembly):
    centre = Vector((RADIATOR_X - 0.10, -0.46, 0.70))
    with assembly.part("expansion-tank", "cooling", "black-plastic", smooth=True) as bm:
        add_box(bm, (0.16, 0.10, 0.16), place(centre), bevel=0.025, bevel_segments=3)
        add_cylinder(bm, 0.028, 0.03, place(centre + Vector((0.0, 0.0, 0.09)), ALONG_Z), segments=20, chamfer=0.004)


def build_hoses(assembly: Assembly):
    thermostat_outlet = engine_point(FRONT_FACE + 0.06, INTAKE_SIDE * 0.150, 0.065)
    pump_inlet = engine_point(FRONT_FACE + 0.06, INTAKE_SIDE * 0.150, -0.045)
    radiator_upper = Vector((RADIATOR_X - 0.055, RADIATOR_HALF_WIDTH + 0.025, RADIATOR_TOP - 0.03))
    radiator_lower = Vector((RADIATOR_X - 0.055, -(RADIATOR_HALF_WIDTH + 0.025), RADIATOR_BOTTOM + 0.03))
    tank_outlet = Vector((RADIATOR_X - 0.10, -0.46, 0.62))
    with assembly.part("cooling-hoses", "cooling", "rubber", smooth=True) as bm:
        upper = [thermostat_outlet, thermostat_outlet + Vector((0.12, 0.04, 0.10)), radiator_upper + Vector((-0.10, -0.02, 0.0)), radiator_upper]
        add_sweep(bm, smooth_path(upper, 8), 0.019, segments=14)
        lower = [radiator_lower, radiator_lower + Vector((-0.12, 0.05, -0.03)), Vector((pump_inlet.x + 0.12, 0.05, 0.25)), pump_inlet + Vector((0.05, 0.0, -0.03)), pump_inlet]
        add_sweep(bm, smooth_path(lower, 8), 0.019, segments=14)
        bleed = [tank_outlet, tank_outlet + Vector((0.03, 0.10, -0.02)), Vector((RADIATOR_X - 0.05, -0.20, RADIATOR_TOP + 0.02))]
        add_sweep(bm, smooth_path(bleed, 6), 0.007, segments=10)
        for offset in (0.0, 0.05):
            heater = [thermostat_outlet + Vector((-0.02, 0.0, 0.03)), engine_point(0.0, INTAKE_SIDE * 0.24, 0.05) + Vector((0.0, offset, 0.0)), Vector((ref.BULKHEAD_X + 0.02, 0.20 + offset, 0.66))]
            add_sweep(bm, smooth_path(heater, 8), 0.009, segments=10)


def build_intercooler(assembly: Assembly):
    with assembly.part("intercooler", "intake", "aluminium") as bm:
        add_box(bm, (0.05, 0.56, 0.15), place((ref.FRONT_END_X - 0.09, 0.0, 0.27)))
        for side in (1.0, -1.0):
            add_box(bm, (0.07, 0.06, 0.17), place((ref.FRONT_END_X - 0.09, side * 0.31, 0.27)), bevel=0.012)


def exhaust_collectors():
    groups = [(0, 1, 2), (3, 4, 5)]
    collectors = []
    for group in groups:
        mean_u = sum(cylinder_u(index) for index in group) / 3.0
        collectors.append(engine_point(mean_u, EXHAUST_SIDE * 0.215, 0.055))
    return collectors


def build_exhaust_manifold(assembly: Assembly):
    collectors = exhaust_collectors()
    with assembly.part("exhaust-manifold", "exhaust", "exhaust", smooth=True) as bm:
        for group_index, group in enumerate(((0, 1, 2), (3, 4, 5))):
            for index in group:
                u = cylinder_u(index)
                runner = [engine_point(u, EXHAUST_SIDE * 0.138, 0.262), engine_point(u, EXHAUST_SIDE * 0.200, 0.235), engine_point(u * 0.6 + (sum(cylinder_u(i) for i in group) / 3.0) * 0.4, EXHAUST_SIDE * 0.225, 0.140), collectors[group_index]]
                add_sweep(bm, smooth_path(runner, 6), 0.018, segments=12)
            flange_centre = engine_point(sum(cylinder_u(i) for i in group) / 3.0, EXHAUST_SIDE * 0.137, 0.262)
            add_box(bm, (0.24, 0.012, 0.05), Matrix.Translation(flange_centre) @ Matrix.Rotation(math.radians(ref.ENGINE_TILT), 4, "X"))


def catalyst_ends():
    ends = []
    for centre in (CAT_FRONT_CENTRE, CAT_REAR_CENTRE):
        ends.append((centre + Vector((CAT_LENGTH / 2.0, 0.0, 0.0)), centre - Vector((CAT_LENGTH / 2.0, 0.0, 0.0))))
    return ends


def build_catalytic_converters(assembly: Assembly):
    profile = [(-CAT_LENGTH / 2.0, 0.0), (-CAT_LENGTH / 2.0, 0.025), (-CAT_LENGTH / 2.0 + 0.04, 0.062), (CAT_LENGTH / 2.0 - 0.04, 0.062), (CAT_LENGTH / 2.0, 0.025), (CAT_LENGTH / 2.0, 0.0)]
    collectors = exhaust_collectors()
    with assembly.part("catalytic-converter", "exhaust", "exhaust", smooth=True) as bm:
        for collector, centre in zip(collectors, (CAT_FRONT_CENTRE, CAT_REAR_CENTRE)):
            add_lathe(bm, profile, 28, place(centre, ALONG_X))
            inlet = centre + Vector((CAT_LENGTH / 2.0, 0.0, 0.0))
            downpipe = [collector, collector + Vector((-0.02, -0.02, -0.07)), inlet + Vector((0.08, 0.0, 0.04)), inlet]
            add_sweep(bm, smooth_path(downpipe, 6), 0.026, segments=14)


def build_oxygen_sensors(assembly: Assembly):
    collectors = exhaust_collectors()
    with assembly.part("oxygen-sensors", "exhaust", "steel", smooth=True) as bm:
        for collector, (inlet, outlet) in zip(collectors, catalyst_ends()):
            for anchor in (collector + Vector((-0.015, -0.03, -0.09)), outlet + Vector((-0.06, 0.0, 0.03))):
                add_cylinder(bm, 0.009, 0.05, place(anchor + Vector((0.0, 0.0, 0.025)), ALONG_Z), segments=12)
                add_cylinder(bm, 0.012, 0.012, place(anchor + Vector((0.0, 0.0, 0.004)), ALONG_Z), segments=6)


def build_particulate_filter(assembly: Assembly):
    profile = [(-0.17, 0.0), (-0.17, 0.03), (-0.13, 0.075), (0.13, 0.075), (0.17, 0.03), (0.17, 0.0)]
    with assembly.part("particulate-filter", "exhaust", "exhaust", smooth=True) as bm:
        add_lathe(bm, profile, 28, place((0.50, -0.20, 0.235), ALONG_X))


def build_exhaust_system(assembly: Assembly):
    ends = catalyst_ends()
    centre_box = Vector((-0.05, -0.06, 0.215))
    rear_box = Vector((ref.REAR_AXLE_X - 0.62, -0.03, 0.30))
    with assembly.part("exhaust-system", "exhaust", "exhaust", smooth=True) as bm:
        for index, (_, outlet) in enumerate(ends):
            lane = -0.11 + 0.06 * index
            pipe = [outlet, outlet + Vector((-0.10, 0.0, -0.01)), Vector((0.42, lane, 0.215)), centre_box + Vector((0.22, lane + 0.06, 0.0))]
            add_sweep(bm, smooth_path(pipe, 8), 0.025, segments=12)
        add_box(bm, (0.44, 0.20, 0.10), place(centre_box), bevel=0.04, bevel_segments=3)
        rear_pipe = [centre_box + Vector((-0.22, 0.0, 0.0)), Vector((-0.75, -0.05, 0.22)), Vector((ref.REAR_AXLE_X + 0.25, -0.30, 0.26)), Vector((ref.REAR_AXLE_X - 0.25, -0.33, 0.30)), rear_box + Vector((0.10, -0.32, 0.0))]
        add_sweep(bm, smooth_path(rear_pipe, 8), 0.027, segments=12)
        add_box(bm, (0.24, 0.86, 0.19), place(rear_box), bevel=0.06, bevel_segments=3)
        for tail_y in (0.32, 0.42):
            tail = [rear_box + Vector((-0.10, tail_y, -0.02)), Vector((ref.REAR_END_X + 0.12, tail_y, 0.27)), Vector((ref.REAR_END_X + 0.02, tail_y, 0.27))]
            add_sweep(bm, smooth_path(tail, 4), 0.034, segments=16)


def build_cooling_and_exhaust(assembly: Assembly):
    build_radiator(assembly)
    build_fan(assembly)
    build_expansion_tank(assembly)
    build_hoses(assembly)
    build_intercooler(assembly)
    build_exhaust_manifold(assembly)
    build_catalytic_converters(assembly)
    build_oxygen_sensors(assembly)
    build_particulate_filter(assembly)
    build_exhaust_system(assembly)
