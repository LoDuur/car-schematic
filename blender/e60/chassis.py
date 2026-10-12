import math

from mathutils import Matrix, Vector

from e60 import reference as ref
from e60.assembly import Assembly
from lib.geom import ALONG_X, ALONG_Y, ALONG_Z, add_box, add_coil_spring, add_cylinder, add_lathe, add_sweep, align_x, place, smooth_path

SIDES = (1.0, -1.0)
FRONT_KNUCKLE_INSET = 0.13
REAR_KNUCKLE_INSET = 0.12
HUB_INSET = 0.035


def wheel_centre(axle_x: float, track_half: float, side: float) -> Vector:
    return Vector((axle_x, side * track_half, ref.WHEEL_CENTRE_Z))


def axle_matrix(centre: Vector, side: float, extra: Matrix = Matrix()) -> Matrix:
    return Matrix.Translation(centre) @ Matrix.Rotation(math.pi / 2.0 if side > 0 else -math.pi / 2.0, 4, "Z") @ extra


def tyre_profile():
    half = ref.m("tyre_width") / 2.0
    bead, outer = ref.m("rim_radius"), ref.TYRE_RADIUS
    return [
        (-half + 0.01, bead), (-half - 0.002, bead + 0.03), (-half - 0.004, bead + 0.07), (-half + 0.004, outer - 0.03),
        (-half + 0.025, outer - 0.006), (-half + 0.05, outer), (half - 0.05, outer), (half - 0.025, outer - 0.006),
        (half - 0.004, outer - 0.03), (half + 0.004, bead + 0.07), (half + 0.002, bead + 0.03), (half - 0.01, bead), (-half + 0.01, bead),
    ]


def rim_profile():
    half = ref.m("rim_width") / 2.0
    bead = ref.m("rim_radius")
    return [
        (-half, bead + 0.012), (-half + 0.012, bead), (half - 0.012, bead), (half, bead + 0.012),
        (half, bead - 0.008), (half - 0.02, bead - 0.016), (-half + 0.02, bead - 0.016), (-half, bead - 0.008), (-half, bead + 0.012),
    ]


def add_wheel(bm, centre: Vector, side: float):
    add_lathe(bm, tyre_profile(), 56, axle_matrix(centre, side))
    add_lathe(bm, rim_profile(), 56, axle_matrix(centre, side))
    outer_face = ref.m("rim_width") / 2.0 - 0.03
    add_cylinder(bm, 0.075, 0.03, axle_matrix(centre, side, Matrix.Translation((outer_face - 0.03, 0.0, 0.0))), segments=32)
    for spoke in range(10):
        angle = 2.0 * math.pi * (spoke // 2) / 5 + (0.12 if spoke % 2 else -0.12)
        radial_mid = 0.135
        spoke_matrix = Matrix.Translation((outer_face - 0.02, radial_mid * math.cos(angle), radial_mid * math.sin(angle))) @ Matrix.Rotation(angle, 4, "X")
        add_box(bm, (0.022, 0.13, 0.022), axle_matrix(centre, side, spoke_matrix), bevel=0.006)


def build_wheels(assembly: Assembly):
    with assembly.part("wheels-and-tyres", "suspension", "rubber", smooth=True) as bm:
        for axle_x, track_half in ((ref.FRONT_AXLE_X, ref.FRONT_WHEEL_Y), (ref.REAR_AXLE_X, ref.REAR_WHEEL_Y)):
            for side in SIDES:
                add_wheel(bm, wheel_centre(axle_x, track_half, side), side)


def disc_profile(radius: float, thickness: float, vented: bool):
    half = thickness / 2.0
    inner = radius - 0.065
    if vented:
        plate = 0.32 * thickness
        return [
            (-half, inner), (-half, radius), (-half + plate, radius), (-half + plate, inner + 0.01), (half - plate, inner + 0.01),
            (half - plate, radius), (half, radius), (half, inner), (-half, inner),
        ]
    return [(-half, inner), (-half, radius), (half, radius), (half, inner), (-half, inner)]


def add_brake_corner(bm, centre: Vector, side: float, disc_radius: float, disc_thickness: float):
    disc_centre = centre - Vector((0.0, side * HUB_INSET, 0.0))
    add_lathe(bm, disc_profile(disc_radius, disc_thickness, vented=True), 48, axle_matrix(disc_centre, side))
    hat = [(-0.004, 0.0), (-0.004, disc_radius - 0.065), (0.035, disc_radius - 0.07), (0.035, 0.035), (0.04, 0.0)]
    add_lathe(bm, hat, 36, axle_matrix(disc_centre, side))
    caliper = [(-disc_thickness / 2.0 - 0.02, disc_radius - 0.05), (-disc_thickness / 2.0 - 0.02, disc_radius + 0.012), (disc_thickness / 2.0 + 0.022, disc_radius + 0.012), (disc_thickness / 2.0 + 0.022, disc_radius - 0.035), (disc_thickness / 2.0 + 0.008, disc_radius - 0.035), (disc_thickness / 2.0 + 0.008, disc_radius - 0.005), (-disc_thickness / 2.0 - 0.006, disc_radius - 0.005), (-disc_thickness / 2.0 - 0.006, disc_radius - 0.05), (-disc_thickness / 2.0 - 0.02, disc_radius - 0.05)]
    sector = math.radians(68.0)
    rearward = Matrix.Rotation(math.pi if side < 0 else 0.0, 4, "X")
    add_lathe(bm, caliper, 10, axle_matrix(disc_centre, side, rearward @ Matrix.Rotation(-sector / 2.0, 4, "X")), sweep_angle=sector)
    add_cylinder(bm, 0.028, 0.03, axle_matrix(disc_centre, side, rearward @ Matrix.Translation((-disc_thickness / 2.0 - 0.03, disc_radius - 0.02, 0.0))), segments=20)


def build_brakes(assembly: Assembly):
    with assembly.part("front-brakes", "brakes", "brake-disc", smooth=True) as bm:
        for side in SIDES:
            add_brake_corner(bm, wheel_centre(ref.FRONT_AXLE_X, ref.FRONT_WHEEL_Y, side), side, ref.m("front_disc_diameter") / 2.0, ref.m("front_disc_thickness"))
    with assembly.part("rear-brakes", "brakes", "brake-disc", smooth=True) as bm:
        for side in SIDES:
            add_brake_corner(bm, wheel_centre(ref.REAR_AXLE_X, ref.REAR_WHEEL_Y, side), side, ref.m("rear_disc_diameter") / 2.0, ref.m("rear_disc_thickness"))


def front_knuckle(side: float) -> Vector:
    return Vector((ref.FRONT_AXLE_X, side * (ref.FRONT_WHEEL_Y - FRONT_KNUCKLE_INSET), ref.WHEEL_CENTRE_Z))


def front_strut_top(side: float) -> Vector:
    return Vector((ref.FRONT_AXLE_X - 0.03, side * 0.585, 0.80))


def front_strut_bottom(side: float) -> Vector:
    return front_knuckle(side) + Vector((0.0, -side * 0.02, 0.10))


def build_front_struts(assembly: Assembly):
    with assembly.part("front-strut", "suspension", "steel", smooth=True) as bm:
        for side in SIDES:
            bottom, top = front_strut_bottom(side), front_strut_top(side)
            axis = top - bottom
            add_cylinder(bm, 0.027, axis.length * 0.62, align_x(bottom + axis * 0.31, axis), segments=20)
            add_cylinder(bm, 0.011, axis.length * 0.45, align_x(bottom + axis * 0.75, axis), segments=12)
            spring_base = bottom + axis * 0.45
            spring_matrix = align_x(spring_base, axis) @ Matrix.Rotation(math.pi / 2.0, 4, "Y")
            add_coil_spring(bm, 0.068, 0.0065, axis.length * 0.42, 5.2, spring_matrix)
            add_cylinder(bm, 0.085, 0.012, align_x(spring_base, axis), segments=28)
            add_cylinder(bm, 0.075, 0.035, align_x(top - axis.normalized() * 0.03, axis), segments=28, chamfer=0.01)
            knuckle = front_knuckle(side)
            add_box(bm, (0.09, 0.06, 0.22), place(knuckle + Vector((0.0, 0.0, -0.01))), bevel=0.02)
            add_box(bm, (0.13, 0.03, 0.035), place(knuckle + Vector((0.08, -side * 0.01, -0.06))), bevel=0.008)


def build_front_control_arms(assembly: Assembly):
    with assembly.part("front-control-arms", "suspension", "aluminium", smooth=True) as bm:
        for side in SIDES:
            ball_joint = front_knuckle(side) + Vector((0.0, -side * 0.01, -0.13))
            wishbone_inner = Vector((ref.FRONT_AXLE_X - 0.03, side * 0.30, 0.215))
            thrust_inner = Vector((ref.FRONT_AXLE_X + 0.34, side * 0.37, 0.225))
            for inner, radius in ((wishbone_inner, 0.017), (thrust_inner, 0.016)):
                add_sweep(bm, smooth_path([ball_joint, (ball_joint + inner) / 2.0 + Vector((0.0, 0.0, -0.012)), inner], 4), radius, segments=12)
                add_cylinder(bm, 0.03, 0.05, align_x(inner, inner - ball_joint), segments=18, chamfer=0.006)
            add_lathe(bm, [(-0.02, 0.0), (-0.02, 0.022), (0.02, 0.022), (0.02, 0.0)], 18, place(ball_joint, ALONG_Z))


def build_front_subframe(assembly: Assembly):
    with assembly.part("front-subframe", "suspension", "aluminium") as bm:
        add_box(bm, (0.11, 0.74, 0.06), place((ref.FRONT_AXLE_X - 0.03, 0.0, 0.205)), bevel=0.015)
        for side in SIDES:
            add_box(bm, (0.40, 0.06, 0.05), place((ref.FRONT_AXLE_X + 0.16, side * 0.36, 0.215)), bevel=0.012)
            add_box(bm, (0.24, 0.06, 0.05), place((ref.ENGINE_CENTRE_X + 0.16, side * 0.30, 0.215)), bevel=0.012)
            add_box(bm, (0.08, 0.08, 0.035), place((ref.ENGINE_CENTRE_X + 0.04, side * 0.30, 0.205)), bevel=0.01)
        add_box(bm, (0.40, 0.66, 0.008), place((ref.FRONT_AXLE_X + 0.13, 0.0, 0.18)))


def build_front_anti_roll_bar(assembly: Assembly):
    with assembly.part("front-anti-roll-bar", "suspension", "steel", smooth=True) as bm:
        bar = [
            Vector((ref.FRONT_AXLE_X + 0.03, 0.56, 0.30)), Vector((ref.FRONT_AXLE_X + 0.20, 0.44, 0.255)),
            Vector((ref.FRONT_AXLE_X + 0.22, 0.0, 0.25)), Vector((ref.FRONT_AXLE_X + 0.20, -0.44, 0.255)), Vector((ref.FRONT_AXLE_X + 0.03, -0.56, 0.30)),
        ]
        add_sweep(bm, smooth_path(bar, 8), 0.012, segments=10)
        for side in SIDES:
            end = Vector((ref.FRONT_AXLE_X + 0.03, side * 0.56, 0.30))
            strut_point = front_strut_bottom(side) + (front_strut_top(side) - front_strut_bottom(side)) * 0.18
            add_sweep(bm, [end, strut_point], 0.007, segments=8)
            add_cylinder(bm, 0.022, 0.035, place(Vector((ref.FRONT_AXLE_X + 0.20, side * 0.36, 0.255)), ALONG_Y), segments=16)


def build_steering(assembly: Assembly):
    rack_x, rack_z = ref.FRONT_AXLE_X + 0.10, 0.245
    pinion = Vector((rack_x, 0.24, rack_z + 0.04))
    with assembly.part("steering-rack", "steering", "aluminium", smooth=True) as bm:
        add_cylinder(bm, 0.026, 0.56, place((rack_x, 0.0, rack_z), ALONG_Y), segments=20)
        add_box(bm, (0.07, 0.07, 0.09), place(pinion), bevel=0.012)
        for side in SIDES:
            boot_centre = Vector((rack_x, side * 0.33, rack_z))
            add_lathe(bm, [(-0.05, 0.0), (-0.05, 0.02), (-0.03, 0.03), (-0.015, 0.022), (0.0, 0.032), (0.015, 0.022), (0.03, 0.03), (0.05, 0.016), (0.05, 0.0)], 18, place(boot_centre, ALONG_Y))
            arm_end = front_knuckle(side) + Vector((0.14, -side * 0.015, -0.06))
            add_sweep(bm, [Vector((rack_x, side * 0.38, rack_z)), arm_end], 0.011, segments=10)
            add_lathe(bm, [(-0.018, 0.0), (-0.018, 0.018), (0.018, 0.018), (0.018, 0.0)], 14, place(arm_end, ALONG_Z))
    wheel_centre_point = Vector((ref.BULKHEAD_X - 0.50, 0.37, 0.98))
    column_axis = (wheel_centre_point - Vector((ref.BULKHEAD_X - 0.05, 0.36, 0.70))).normalized()
    with assembly.part("steering-column", "steering", "steel", smooth=True) as bm:
        intermediate = [pinion + Vector((0.0, 0.0, 0.04)), pinion + Vector((-0.10, 0.04, 0.18)), Vector((ref.BULKHEAD_X + 0.03, 0.34, 0.62)), Vector((ref.BULKHEAD_X - 0.05, 0.36, 0.70))]
        add_sweep(bm, smooth_path(intermediate, 6), 0.011, segments=10)
        column_start = Vector((ref.BULKHEAD_X - 0.05, 0.36, 0.70))
        column_end = wheel_centre_point - column_axis * 0.08
        add_cylinder(bm, 0.035, (column_end - column_start).length, align_x((column_start + column_end) / 2.0, column_axis), segments=20)
        rim_profile = []
        for step in range(13):
            angle = 2.0 * math.pi * step / 12
            rim_profile.append((0.016 * math.cos(angle), 0.185 + 0.016 * math.sin(angle)))
        add_lathe(bm, rim_profile, 48, align_x(wheel_centre_point, column_axis))
        add_cylinder(bm, 0.07, 0.06, align_x(wheel_centre_point - column_axis * 0.01, column_axis), segments=28, chamfer=0.015)
        for spoke_angle in (math.pi / 2.0, -math.pi / 2.0, math.pi):
            spoke = Matrix.Rotation(spoke_angle, 4, "X") @ Matrix.Translation((0.0, 0.0, 0.12))
            add_box(bm, (0.018, 0.05, 0.13), align_x(wheel_centre_point, column_axis) @ spoke, bevel=0.006)


def rear_knuckle(side: float) -> Vector:
    return Vector((ref.REAR_AXLE_X, side * (ref.REAR_WHEEL_Y - REAR_KNUCKLE_INSET), ref.WHEEL_CENTRE_Z))


def build_rear_suspension_links(assembly: Assembly):
    with assembly.part("rear-control-arms", "suspension", "aluminium", smooth=True) as bm:
        for side in SIDES:
            knuckle = rear_knuckle(side)
            add_box(bm, (0.12, 0.07, 0.24), place(knuckle), bevel=0.025)
            links = [
                (knuckle + Vector((0.01, 0.0, 0.12)), Vector((ref.REAR_AXLE_X + 0.02, side * 0.40, 0.43)), 0.014),
                (knuckle + Vector((0.05, 0.0, -0.02)), Vector((ref.REAR_AXLE_X + 0.32, side * 0.44, 0.29)), 0.014),
                (knuckle + Vector((-0.10, 0.0, -0.07)), Vector((ref.REAR_AXLE_X - 0.14, side * 0.41, 0.25)), 0.012),
            ]
            for outer, inner, radius in links:
                add_sweep(bm, smooth_path([outer, (outer + inner) / 2.0 + Vector((0.0, 0.0, -0.01)), inner], 4), radius, segments=10)
                add_cylinder(bm, 0.026, 0.045, align_x(inner, inner - outer), segments=16, chamfer=0.005)
            lower_outer = knuckle + Vector((0.02, 0.0, -0.11))
            lower_inner_front = Vector((ref.REAR_AXLE_X + 0.10, side * 0.40, 0.22))
            lower_inner_rear = Vector((ref.REAR_AXLE_X - 0.08, side * 0.40, 0.22))
            for inner in (lower_inner_front, lower_inner_rear):
                add_sweep(bm, [lower_outer, inner], 0.016, segments=10)
            add_box(bm, (0.16, 0.16, 0.025), place(Vector((ref.REAR_AXLE_X + 0.01, side * 0.56, 0.215))), bevel=0.01)


def build_rear_springs_dampers(assembly: Assembly):
    with assembly.part("rear-suspension", "suspension", "steel", smooth=True) as bm:
        for side in SIDES:
            spring_base = Vector((ref.REAR_AXLE_X + 0.01, side * 0.56, 0.23))
            add_coil_spring(bm, 0.062, 0.0065, 0.25, 4.5, Matrix.Translation(spring_base))
            add_cylinder(bm, 0.075, 0.012, place(spring_base + Vector((0.0, 0.0, 0.255)), ALONG_Z), segments=24)
            damper_bottom = rear_knuckle(side) + Vector((-0.11, -side * 0.03, -0.06))
            damper_top = Vector((ref.REAR_AXLE_X - 0.17, side * 0.58, 0.70))
            axis = damper_top - damper_bottom
            add_cylinder(bm, 0.024, axis.length * 0.6, align_x(damper_bottom + axis * 0.3, axis), segments=18)
            add_cylinder(bm, 0.010, axis.length * 0.42, align_x(damper_bottom + axis * 0.78, axis), segments=10)
            add_cylinder(bm, 0.05, 0.03, align_x(damper_top, axis), segments=20, chamfer=0.008)


def build_rear_subframe(assembly: Assembly):
    with assembly.part("rear-subframe", "suspension", "steel") as bm:
        for side in SIDES:
            add_box(bm, (0.70, 0.06, 0.07), place((ref.REAR_AXLE_X + 0.05, side * 0.42, 0.30)), bevel=0.015)
            add_cylinder(bm, 0.04, 0.05, place((ref.REAR_AXLE_X + 0.40, side * 0.44, 0.35), ALONG_Z), segments=16)
            add_cylinder(bm, 0.04, 0.05, place((ref.REAR_AXLE_X - 0.30, side * 0.44, 0.35), ALONG_Z), segments=16)
        add_box(bm, (0.08, 0.84, 0.06), place((ref.REAR_AXLE_X + 0.32, 0.0, 0.29)), bevel=0.015)
        add_box(bm, (0.08, 0.84, 0.06), place((ref.REAR_AXLE_X - 0.22, 0.0, 0.29)), bevel=0.015)


def build_rear_anti_roll_bar(assembly: Assembly):
    with assembly.part("rear-anti-roll-bar", "suspension", "steel", smooth=True) as bm:
        bar = [Vector((ref.REAR_AXLE_X - 0.02, 0.52, 0.25)), Vector((ref.REAR_AXLE_X - 0.24, 0.40, 0.27)), Vector((ref.REAR_AXLE_X - 0.26, 0.0, 0.27)), Vector((ref.REAR_AXLE_X - 0.24, -0.40, 0.27)), Vector((ref.REAR_AXLE_X - 0.02, -0.52, 0.25))]
        add_sweep(bm, smooth_path(bar, 8), 0.0105, segments=10)
        for side in SIDES:
            add_sweep(bm, [Vector((ref.REAR_AXLE_X - 0.02, side * 0.52, 0.25)), Vector((ref.REAR_AXLE_X - 0.01, side * 0.53, 0.19))], 0.006, segments=8)


def build_chassis(assembly: Assembly):
    build_wheels(assembly)
    build_brakes(assembly)
    build_front_struts(assembly)
    build_front_control_arms(assembly)
    build_front_subframe(assembly)
    build_front_anti_roll_bar(assembly)
    build_steering(assembly)
    build_rear_suspension_links(assembly)
    build_rear_springs_dampers(assembly)
    build_rear_subframe(assembly)
    build_rear_anti_roll_bar(assembly)
