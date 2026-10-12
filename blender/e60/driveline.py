from mathutils import Vector

from e60 import reference as ref
from e60.assembly import Assembly
from lib.geom import ALONG_X, ALONG_Y, add_box, add_cylinder, add_lathe, add_sweep, align_x, place, smooth_path

TRANSMISSION_FRONT_X = ref.BLOCK_REAR_X - 0.012
TRANSMISSION_LENGTH = 0.70
TRANSMISSION_TAIL_X = TRANSMISSION_FRONT_X - TRANSMISSION_LENGTH
CENTRE_BEARING = Vector((-0.55, 0.0, 0.355))
DIFFERENTIAL_CENTRE = Vector((ref.REAR_AXLE_X, 0.0, 0.335))
DIFFERENTIAL_INPUT = DIFFERENTIAL_CENTRE + Vector((0.26, 0.0, 0.0))
TRANSMISSION_OUTPUT = Vector((TRANSMISSION_TAIL_X - 0.03, 0.0, ref.CRANK_Z - 0.01))

TRANSMISSION_PROFILE = [
    (0.0, 0.0), (0.0, 0.215), (-0.05, 0.215), (-0.17, 0.18), (-0.24, 0.142), (-0.27, 0.135),
    (-0.50, 0.122), (-0.54, 0.095), (-0.64, 0.068), (-0.70, 0.052), (-0.70, 0.0),
]
DIFFERENTIAL_PROFILE = [(0.26, 0.0), (0.26, 0.048), (0.20, 0.052), (0.13, 0.072), (0.06, 0.125), (-0.04, 0.138), (-0.10, 0.118), (-0.125, 0.08), (-0.125, 0.0)]


def bellows_profile(length: float, small: float, large: float, folds: int = 5):
    points = [(-length / 2.0, 0.0), (-length / 2.0, small)]
    ridge_count = folds * 2 + 1
    for ridge in range(1, ridge_count):
        t = ridge / ridge_count
        envelope = large - (large - small) * t
        radius = envelope if ridge % 2 == 1 else small + (envelope - small) * 0.45
        points.append((-length / 2.0 + length * t, radius))
    points += [(length / 2.0, small), (length / 2.0, 0.0)]
    return points


def build_transmission(assembly: Assembly):
    with assembly.part("transmission", "driveline", "aluminium", smooth=True) as bm:
        add_lathe(bm, TRANSMISSION_PROFILE, 40, place((TRANSMISSION_FRONT_X, 0.0, ref.CRANK_Z), ALONG_X))
        add_box(bm, (0.26, 0.22, 0.06), place((TRANSMISSION_FRONT_X - 0.40, 0.0, ref.CRANK_Z - 0.14)), bevel=0.015)
        for rib in range(5):
            add_box(bm, (0.012, 0.02, 0.30), place((TRANSMISSION_FRONT_X - 0.30 - rib * 0.05, -0.12, ref.CRANK_Z)))
        add_lathe(bm, [(-0.012, 0.0), (-0.012, 0.055), (0.012, 0.055), (0.012, 0.0)], 24, place((TRANSMISSION_TAIL_X - 0.012, 0.0, ref.CRANK_Z), ALONG_X))
        add_box(bm, (0.08, 0.30, 0.03), place((TRANSMISSION_TAIL_X + 0.12, 0.0, ref.CRANK_Z - 0.07)), bevel=0.008)
        for lane in (-0.03, 0.03):
            cooler_line = [
                Vector((TRANSMISSION_FRONT_X - 0.20, -0.13 + lane, ref.CRANK_Z - 0.05)),
                Vector((ref.BLOCK_REAR_X + 0.20, -0.20 + lane, 0.30)),
                Vector((ref.FRONT_AXLE_X + 0.30, -0.30 + lane, 0.30)),
                Vector((ref.FRONT_END_X - 0.25, -0.30 + lane, 0.34)),
            ]
            add_sweep(bm, smooth_path(cooler_line, 6), 0.006, segments=8)


def build_propeller_shaft(assembly: Assembly):
    with assembly.part("propeller-shaft", "driveline", "steel", smooth=True) as bm:
        add_lathe(bm, [(-0.012, 0.0), (-0.012, 0.075), (0.012, 0.075), (0.012, 0.0)], 6, align_x(TRANSMISSION_OUTPUT, (1.0, 0.0, 0.0)))
        front_start = TRANSMISSION_OUTPUT + Vector((-0.04, 0.0, 0.0))
        for start, end, radius in ((front_start, CENTRE_BEARING, 0.034), (CENTRE_BEARING, DIFFERENTIAL_INPUT + Vector((0.04, 0.0, 0.0)), 0.038)):
            direction = end - start
            add_cylinder(bm, radius, direction.length - 0.06, align_x((start + end) / 2.0, direction), segments=20)
            for joint in (start + direction.normalized() * 0.03, end - direction.normalized() * 0.03):
                add_cylinder(bm, 0.045, 0.05, align_x(joint, direction), segments=20, chamfer=0.008)
        add_box(bm, (0.06, 0.22, 0.05), place(CENTRE_BEARING + Vector((0.0, 0.0, 0.035))), bevel=0.01)
        add_cylinder(bm, 0.05, 0.04, place(CENTRE_BEARING, ALONG_X), segments=24)


def build_rear_differential(assembly: Assembly):
    with assembly.part("rear-differential", "driveline", "cast-iron", smooth=True) as bm:
        add_lathe(bm, DIFFERENTIAL_PROFILE, 36, place(DIFFERENTIAL_CENTRE, ALONG_X))
        for side in (1.0, -1.0):
            add_cylinder(bm, 0.06, 0.10, place(DIFFERENTIAL_CENTRE + Vector((0.0, side * 0.12, 0.0)), ALONG_Y), segments=28, chamfer=0.01)
            add_box(bm, (0.08, 0.06, 0.04), place(DIFFERENTIAL_CENTRE + Vector((-0.02, side * 0.15, 0.10))), bevel=0.01)
        for fin in range(5):
            add_box(bm, (0.012, 0.20, 0.008), place(DIFFERENTIAL_CENTRE + Vector((-0.126, 0.0, -0.06 + fin * 0.03))))
        add_box(bm, (0.08, 0.05, 0.05), place(DIFFERENTIAL_CENTRE + Vector((0.16, 0.0, 0.08))), bevel=0.01)


def build_rear_drive_shafts(assembly: Assembly):
    with assembly.part("rear-drive-shafts", "driveline", "steel", smooth=True) as bm:
        for side in (1.0, -1.0):
            inner = DIFFERENTIAL_CENTRE + Vector((0.0, side * 0.18, 0.0))
            outer = Vector((ref.REAR_AXLE_X, side * (ref.REAR_WHEEL_Y - 0.10), ref.WHEEL_CENTRE_Z))
            direction = outer - inner
            add_cylinder(bm, 0.013, direction.length - 0.12, align_x((inner + outer) / 2.0, direction), segments=14)
            for joint, small_end in ((inner, outer), (outer, inner)):
                boot_centre = joint + (small_end - joint).normalized() * 0.075
                add_lathe(bm, bellows_profile(0.10, 0.016, 0.042), 20, align_x(boot_centre, direction))
                add_cylinder(bm, 0.045, 0.05, align_x(joint, direction), segments=20, chamfer=0.006)


def build_manual_clutch(assembly: Assembly):
    with assembly.part("clutch", "driveline", "steel", smooth=True) as bm:
        add_cylinder(bm, 0.150, 0.025, place((ref.BLOCK_REAR_X - 0.03, 0.0, ref.CRANK_Z), ALONG_X), segments=40)
        add_cylinder(bm, 0.120, 0.030, place((ref.BLOCK_REAR_X - 0.06, 0.0, ref.CRANK_Z), ALONG_X), segments=40, chamfer=0.006)


def build_all_wheel_drive(assembly: Assembly):
    transfer_centre = Vector((TRANSMISSION_TAIL_X + 0.02, -0.07, ref.CRANK_Z - 0.04))
    front_differential_centre = Vector((ref.FRONT_AXLE_X - 0.02, -0.17, 0.30))
    with assembly.part("transfer-case", "driveline", "aluminium", smooth=True) as bm:
        add_box(bm, (0.20, 0.20, 0.24), place(transfer_centre), bevel=0.04, bevel_segments=3)
        front_shaft = [transfer_centre + Vector((0.08, -0.06, -0.08)), Vector((ref.BLOCK_REAR_X + 0.10, -0.16, 0.30)), front_differential_centre + Vector((-0.12, 0.0, 0.0))]
        add_sweep(bm, smooth_path(front_shaft, 6), 0.025, segments=12)
    with assembly.part("front-differential", "driveline", "aluminium", smooth=True) as bm:
        add_lathe(bm, [(0.10, 0.0), (0.10, 0.04), (0.04, 0.08), (-0.06, 0.09), (-0.09, 0.06), (-0.09, 0.0)], 28, place(front_differential_centre, ALONG_X))
        for side in (1.0, -1.0):
            inner = front_differential_centre + Vector((0.0, side * 0.10, 0.0))
            outer = Vector((ref.FRONT_AXLE_X, side * (ref.FRONT_WHEEL_Y - 0.10), ref.WHEEL_CENTRE_Z))
            direction = outer - inner
            add_cylinder(bm, 0.013, direction.length, align_x((inner + outer) / 2.0, direction), segments=14)


def build_driveline(assembly: Assembly):
    build_transmission(assembly)
    build_propeller_shaft(assembly)
    build_rear_differential(assembly)
    build_rear_drive_shafts(assembly)
    build_manual_clutch(assembly)
    build_all_wheel_drive(assembly)
