import math

from mathutils import Matrix, Vector

from e60 import reference as ref
from e60.assembly import Assembly
from e60.cooling_exhaust import exhaust_collectors
from e60.engine import EXHAUST_SIDE, HALF_LENGTH, INTAKE_SIDE, cylinder_u, engine_matrix, engine_point
from lib.geom import ALONG_X, ALONG_Z, add_box, add_cylinder, add_lathe, add_sweep, align_x, place, smooth_path

TANK_CENTRE_X = -0.85
TANK_LENGTH = 0.42
LOBE_INNER_Y, LOBE_OUTER_Y = 0.14, 0.50
LOBE_BOTTOM, LOBE_TOP = 0.21, 0.43
BRIDGE_BOTTOM, BRIDGE_TOP = 0.40, 0.46
FUEL_PUMP_CENTRE = Vector((TANK_CENTRE_X, -0.32, 0.32))
BOOSTER_CENTRE = Vector((ref.BULKHEAD_X + 0.08, 0.40, 0.78))
DSC_CENTRE = Vector((ref.FRONT_AXLE_X + 0.12, 0.50, 0.57))
BATTERY_CENTRE = Vector((ref.REAR_END_X + 0.50, -0.50, 0.42))


def build_fuel_tank(assembly: Assembly):
    lobe_width = LOBE_OUTER_Y - LOBE_INNER_Y
    with assembly.part("fuel-tank", "fuel", "black-plastic", smooth=True) as bm:
        for side in (1.0, -1.0):
            add_box(bm, (TANK_LENGTH, lobe_width, LOBE_TOP - LOBE_BOTTOM), place((TANK_CENTRE_X, side * (LOBE_INNER_Y + lobe_width / 2.0), (LOBE_TOP + LOBE_BOTTOM) / 2.0)), bevel=0.045, bevel_segments=3)
        add_box(bm, (TANK_LENGTH - 0.04, 2 * LOBE_INNER_Y + 0.08, BRIDGE_TOP - BRIDGE_BOTTOM), place((TANK_CENTRE_X, 0.0, (BRIDGE_TOP + BRIDGE_BOTTOM) / 2.0)), bevel=0.02)
        filler = [Vector((TANK_CENTRE_X - 0.18, -0.44, 0.42)), Vector((TANK_CENTRE_X - 0.40, -0.62, 0.55)), Vector((ref.REAR_AXLE_X - 0.10, -0.86, 0.72))]
        add_sweep(bm, smooth_path(filler, 8), 0.022, segments=14)


def build_fuel_pump(assembly: Assembly):
    with assembly.part("fuel-pump", "fuel", "black-plastic", smooth=True) as bm:
        add_cylinder(bm, 0.048, 0.19, place(FUEL_PUMP_CENTRE, ALONG_Z), segments=24, chamfer=0.006)
        add_cylinder(bm, 0.07, 0.012, place(FUEL_PUMP_CENTRE + Vector((0.0, 0.0, 0.115)), ALONG_Z), segments=28)
        add_box(bm, (0.03, 0.03, 0.02), place(FUEL_PUMP_CENTRE + Vector((0.03, 0.02, 0.13))))


def build_fuel_lines(assembly: Assembly):
    rail_end = engine_point(-HALF_LENGTH + 0.04, INTAKE_SIDE * 0.185, 0.330)
    flange = FUEL_PUMP_CENTRE + Vector((0.03, 0.0, 0.13))
    route = [
        flange, flange + Vector((0.06, 0.04, 0.03)), Vector((TANK_CENTRE_X + 0.28, -0.18, 0.21)), Vector((-0.40, 0.26, 0.17)),
        Vector((ref.BULKHEAD_X - 0.30, 0.27, 0.17)), Vector((ref.BULKHEAD_X + 0.05, 0.28, 0.30)), rail_end + Vector((-0.08, 0.04, 0.04)), rail_end,
    ]
    with assembly.part("fuel-lines", "fuel", "steel", smooth=True) as bm:
        add_sweep(bm, smooth_path(route, 6), 0.005, segments=8)


def build_brake_hydraulics(assembly: Assembly):
    with assembly.part("brake-booster", "brakes", "steel", smooth=True) as bm:
        booster = [(0.0, 0.0), (0.0, 0.10), (0.03, 0.125), (0.13, 0.125), (0.16, 0.10), (0.16, 0.0)]
        add_lathe(bm, booster, 36, place(BOOSTER_CENTRE + Vector((-0.02, 0.0, 0.0)), ALONG_X))
        add_cylinder(bm, 0.024, 0.16, place(BOOSTER_CENTRE + Vector((0.22, 0.0, 0.0)), ALONG_X), segments=18)
        add_box(bm, (0.10, 0.07, 0.06), place(BOOSTER_CENTRE + Vector((0.22, 0.0, 0.06))), bevel=0.012)
    master_outlet = BOOSTER_CENTRE + Vector((0.28, -0.02, -0.01))
    with assembly.part("dsc-unit", "brakes", "aluminium", smooth=True) as bm:
        add_box(bm, (0.13, 0.11, 0.10), place(DSC_CENTRE), bevel=0.012)
        add_cylinder(bm, 0.035, 0.08, place(DSC_CENTRE + Vector((0.0, 0.09, -0.01)), (0.0, 0.0, math.pi / 2.0)), segments=20)
        add_box(bm, (0.12, 0.03, 0.08), place(DSC_CENTRE + Vector((0.0, -0.07, 0.0))), bevel=0.006)
        for lane in (0.0, 0.02):
            add_sweep(bm, smooth_path([master_outlet + Vector((0.0, lane, 0.0)), master_outlet + Vector((0.10, lane + 0.04, -0.06)), DSC_CENTRE + Vector((-0.07, lane, 0.03))], 6), 0.0035, segments=6)
        for side in (1.0, -1.0):
            wheel = Vector((ref.FRONT_AXLE_X - 0.06, side * (ref.FRONT_WHEEL_Y - 0.10), ref.WHEEL_CENTRE_Z + 0.10))
            line = [DSC_CENTRE + Vector((0.0, 0.0, -0.05)), Vector((ref.FRONT_AXLE_X + 0.02, side * 0.48, 0.45)), wheel]
            add_sweep(bm, smooth_path(line, 6), 0.0035, segments=6)


def build_battery(assembly: Assembly):
    with assembly.part("battery", "electrical", "black-plastic") as bm:
        add_box(bm, (0.315, 0.175, 0.19), place(BATTERY_CENTRE), bevel=0.008)
        for offset in (-0.11, 0.11):
            add_cylinder(bm, 0.009, 0.02, place(BATTERY_CENTRE + Vector((offset, 0.05, 0.105)), ALONG_Z), segments=12)
    with assembly.part("battery-sensor", "electrical", "black-plastic") as bm:
        add_box(bm, (0.05, 0.04, 0.028), place(BATTERY_CENTRE + Vector((-0.11, 0.02, 0.12))), bevel=0.005)
        add_sweep(bm, [BATTERY_CENTRE + Vector((-0.13, 0.02, 0.12)), BATTERY_CENTRE + Vector((-0.20, 0.02, 0.06)), BATTERY_CENTRE + Vector((-0.22, 0.04, -0.09))], 0.006, segments=8)


def build_control_units(assembly: Assembly):
    with assembly.part("engine-control-unit", "engine", "aluminium") as bm:
        add_box(bm, (0.20, 0.16, 0.045), place((ref.BULKHEAD_X + 0.08, -0.56, 0.80), (0.0, 0.35, 0.0)), bevel=0.006)
        for index in range(3):
            add_box(bm, (0.03, 0.04, 0.05), place((ref.BULKHEAD_X + 0.19, -0.61 + index * 0.05, 0.80)), bevel=0.004)
    with assembly.part("car-access-system", "electrical", "black-plastic") as bm:
        add_box(bm, (0.13, 0.10, 0.035), place((ref.BULKHEAD_X - 0.36, 0.30, 0.72)), bevel=0.005)
        add_box(bm, (0.03, 0.04, 0.03), place((ref.BULKHEAD_X - 0.30, 0.30, 0.74)))


def build_other_variant_parts(assembly: Assembly):
    collectors = exhaust_collectors()
    turbo_centre = (collectors[0] + collectors[1]) / 2.0 + Vector((0.0, -0.10, -0.03))
    with assembly.part("turbocharger", "intake", "cast-iron", smooth=True) as bm:
        volute = []
        for step in range(13):
            angle = 2.0 * math.pi * step / 12
            volute.append((0.03 * math.cos(angle), 0.07 + 0.03 * math.sin(angle)))
        add_lathe(bm, volute, 32, place(turbo_centre + Vector((0.04, 0.0, 0.0)), ALONG_X))
        add_lathe(bm, volute, 32, place(turbo_centre + Vector((-0.07, 0.0, 0.0)), ALONG_X))
        add_cylinder(bm, 0.03, 0.08, place(turbo_centre + Vector((-0.015, 0.0, 0.0)), ALONG_X), segments=20)
        for collector in collectors:
            add_sweep(bm, smooth_path([collector, (collector + turbo_centre) / 2.0 + Vector((0.0, -0.03, 0.0)), turbo_centre + Vector((0.04, 0.0, 0.07))], 4), 0.02, segments=10)
    with assembly.part("high-pressure-pump", "fuel", "aluminium", smooth=True) as bm:
        add_cylinder(bm, 0.035, 0.09, engine_matrix((-HALF_LENGTH + 0.06, EXHAUST_SIDE * 0.07, 0.385), ALONG_Z), segments=20, chamfer=0.006)
        add_box(bm, (0.05, 0.06, 0.03), engine_matrix((-HALF_LENGTH + 0.06, EXHAUST_SIDE * 0.07, 0.44)), bevel=0.006)
    with assembly.part("glow-plugs", "ignition", "steel", smooth=True) as bm:
        for index in range(ref.CYLINDER_COUNT):
            u = cylinder_u(index)
            top, tip = engine_point(u, INTAKE_SIDE * 0.10, 0.33), engine_point(u, INTAKE_SIDE * 0.03, 0.24)
            add_cylinder(bm, 0.005, (top - tip).length, align_x((top + tip) / 2.0, top - tip), segments=10)
            add_cylinder(bm, 0.008, 0.012, align_x(top, top - tip), segments=6)


def build_supporting_systems(assembly: Assembly):
    build_fuel_tank(assembly)
    build_fuel_pump(assembly)
    build_fuel_lines(assembly)
    build_brake_hydraulics(assembly)
    build_battery(assembly)
    build_control_units(assembly)
    build_other_variant_parts(assembly)
