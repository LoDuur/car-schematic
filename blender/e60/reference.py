from dataclasses import dataclass

REFERENCE_CONFIG = {
    "year": "2006",
    "body": "sedan",
    "model": "525i",
    "engine": "N52B25",
    "fuel": "petrol",
    "transmission": "automatic-6",
    "drivetrain": "rwd",
}

REFERENCE_DESCRIPTION = (
    "BMW 525i saloon (E60), 2006, N52B25 inline-six, 6-speed Steptronic automatic, rear-wheel drive, "
    "left-hand drive, 225/55 R16 tyres on 7J x 16 wheels."
)

BMW_PRESS_SALOON_2005 = "bmw-press-saloon-2005"
WIKIPEDIA_N52 = "wikipedia-n52"
WIKIPEDIA_E60 = "wikipedia-e60"


@dataclass(frozen=True)
class Measure:
    value: float
    status: str
    source: str | None
    note: str


MEASURES: dict[str, Measure] = {
    "length": Measure(4.841, "verified", BMW_PRESS_SALOON_2005, "Overall length, saloon."),
    "width": Measure(1.846, "verified", BMW_PRESS_SALOON_2005, "Overall width without mirrors."),
    "height": Measure(1.468, "verified", BMW_PRESS_SALOON_2005, "Unladen height, saloon."),
    "wheelbase": Measure(2.888, "verified", BMW_PRESS_SALOON_2005, "Wheelbase, saloon."),
    "track_front": Measure(1.558, "verified", BMW_PRESS_SALOON_2005, "Front track."),
    "track_rear": Measure(1.582, "verified", BMW_PRESS_SALOON_2005, "Rear track."),
    "tyre_radius": Measure(0.3270, "verified", BMW_PRESS_SALOON_2005, "Derived from 225/55 R16: 406.4 mm rim + 2 x 123.75 mm sidewall = 653.9 mm diameter."),
    "tyre_width": Measure(0.225, "verified", BMW_PRESS_SALOON_2005, "225 mm section width."),
    "rim_radius": Measure(0.2032, "verified", BMW_PRESS_SALOON_2005, "16 inch rim diameter."),
    "rim_width": Measure(0.1778, "verified", BMW_PRESS_SALOON_2005, "7 J rim width."),
    "rear_disc_diameter": Measure(0.320, "verified", BMW_PRESS_SALOON_2005, "Rear disc 320 x 20 mm, vented."),
    "rear_disc_thickness": Measure(0.020, "verified", BMW_PRESS_SALOON_2005, "Rear disc 320 x 20 mm, vented."),
    "front_disc_diameter": Measure(0.324, "unverified", BMW_PRESS_SALOON_2005, "Press sheet columns are misaligned; a 2004 sheet gives 310 x 24 mm for the earlier 525i."),
    "front_disc_thickness": Measure(0.030, "unverified", BMW_PRESS_SALOON_2005, "See front disc diameter."),
    "fuel_tank_volume_litres": Measure(70.0, "verified", BMW_PRESS_SALOON_2005, "Approximately 70 litres."),
    "bore": Measure(0.082, "verified", WIKIPEDIA_N52, "N52B25 bore 82 mm."),
    "stroke": Measure(0.0788, "verified", WIKIPEDIA_N52, "N52B25 stroke 78.8 mm."),
    "front_overhang": Measure(0.840, "approximate", None, "Estimated from side photographs; total overhang is 1.953 m (length minus wheelbase)."),
    "ground_clearance": Measure(0.135, "approximate", None, "Estimated sill height above ground."),
    "bore_spacing": Measure(0.091, "approximate", None, "BMW inline-six bore spacing is commonly given as 91 mm; not checked against a cited source."),
    "engine_inclination_degrees": Measure(30.0, "approximate", None, "Engine leans toward the exhaust (right) side; angle not checked against a cited source."),
}


def m(key: str) -> float:
    return MEASURES[key].value


WHEELBASE = m("wheelbase")
FRONT_AXLE_X = WHEELBASE / 2.0
REAR_AXLE_X = -WHEELBASE / 2.0
FRONT_OVERHANG = m("front_overhang")
FRONT_END_X = FRONT_AXLE_X + FRONT_OVERHANG
REAR_END_X = FRONT_END_X - m("length")
HALF_WIDTH = m("width") / 2.0
TYRE_RADIUS = m("tyre_radius")
WHEEL_CENTRE_Z = TYRE_RADIUS
FRONT_WHEEL_Y = m("track_front") / 2.0
REAR_WHEEL_Y = m("track_rear") / 2.0
ROOF_Z = m("height")
SILL_Z = m("ground_clearance")

CYLINDER_COUNT = 6
BORE_SPACING = m("bore_spacing")
ENGINE_TILT = m("engine_inclination_degrees")
CRANK_Z = 0.42
BLOCK_FRONT_X = FRONT_AXLE_X + 0.06
BLOCK_LENGTH = CYLINDER_COUNT * BORE_SPACING + 0.075
BLOCK_REAR_X = BLOCK_FRONT_X - BLOCK_LENGTH
ENGINE_CENTRE_X = (BLOCK_FRONT_X + BLOCK_REAR_X) / 2.0
BULKHEAD_X = BLOCK_REAR_X - 0.10

APPROXIMATE_LAYOUT_NOTE = (
    "Overall dimensions, track, tyre size and brake disc sizes follow BMW press data. Component shapes and positions are "
    "reconstructed from those dimensions and general BMW drivetrain layout. They have not been checked against photographs, "
    "workshop diagrams or factory CAD data, so treat every position as approximate."
)
