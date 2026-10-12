import math

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

X_AXIS = Vector((1.0, 0.0, 0.0))
ALONG_X = (0.0, 0.0, 0.0)
ALONG_Y = (0.0, 0.0, math.pi / 2.0)
ALONG_Z = (0.0, -math.pi / 2.0, 0.0)


def place(location=(0.0, 0.0, 0.0), rotation=(0.0, 0.0, 0.0), scale=(1.0, 1.0, 1.0)) -> Matrix:
    scale_vector = Vector(scale) if not isinstance(scale, (int, float)) else Vector((scale, scale, scale))
    return Matrix.LocRotScale(Vector(location), Euler(rotation).to_quaternion(), scale_vector)


def align_x(location, direction) -> Matrix:
    rotation = X_AXIS.rotation_difference(Vector(direction).normalized()).to_matrix().to_4x4()
    return Matrix.Translation(Vector(location)) @ rotation


def _transform_new(bm, verts, matrix: Matrix):
    bmesh.ops.transform(bm, matrix=matrix, verts=list(verts))


def merge_into(target, source) -> None:
    scratch = bpy.data.meshes.new("__merge_scratch")
    source.to_mesh(scratch)
    source.free()
    target.from_mesh(scratch)
    bpy.data.meshes.remove(scratch)


def add_box(bm, size, matrix: Matrix = Matrix(), bevel: float = 0.0, bevel_segments: int = 2):
    piece = bmesh.new()
    bmesh.ops.create_cube(piece, size=1.0)
    bmesh.ops.scale(piece, vec=Vector(size), verts=piece.verts)
    if bevel > 0.0:
        bmesh.ops.bevel(
            piece, geom=list(piece.verts) + list(piece.edges), offset=bevel, segments=bevel_segments, profile=0.5, affect="EDGES", clamp_overlap=True
        )
    bmesh.ops.transform(piece, matrix=matrix, verts=piece.verts)
    merge_into(bm, piece)


def add_lathe(bm, profile, segments: int = 32, matrix: Matrix = Matrix(), sweep_angle: float = 2.0 * math.pi):
    is_full_turn = abs(sweep_angle - 2.0 * math.pi) < 1e-6
    ring_count = segments if is_full_turn else segments + 1
    rings = []
    for ring_index in range(ring_count):
        angle = sweep_angle * ring_index / segments
        cosine, sine = math.cos(angle), math.sin(angle)
        rings.append([bm.verts.new((axial, radius * cosine, radius * sine)) for axial, radius in profile])
    for ring_index in range(segments):
        current = rings[ring_index]
        following = rings[(ring_index + 1) % ring_count]
        for point_index in range(len(profile) - 1):
            quad = [current[point_index], current[point_index + 1], following[point_index + 1], following[point_index]]
            unique = []
            for vert in quad:
                if vert not in unique:
                    unique.append(vert)
            if len(unique) >= 3:
                try:
                    bm.faces.new(unique)
                except ValueError:
                    pass
    verts = [vert for ring in rings for vert in ring]
    bmesh.ops.remove_doubles(bm, verts=verts, dist=1e-6)
    verts = [vert for vert in verts if vert.is_valid]
    _transform_new(bm, verts, matrix)
    return verts


def add_cylinder(bm, radius: float, length: float, matrix: Matrix = Matrix(), segments: int = 24, chamfer: float = 0.0):
    half = length / 2.0
    if chamfer > 0.0:
        profile = [(-half, 0.0), (-half, radius - chamfer), (-half + chamfer, radius), (half - chamfer, radius), (half, radius - chamfer), (half, 0.0)]
    else:
        profile = [(-half, 0.0), (-half, radius), (half, radius), (half, 0.0)]
    return add_lathe(bm, profile, segments, matrix)


def add_prism(bm, outline, depth: float, matrix: Matrix = Matrix()):
    bottom = [bm.verts.new((x, y, -depth / 2.0)) for x, y in outline]
    top = [bm.verts.new((x, y, depth / 2.0)) for x, y in outline]
    bm.faces.new(list(reversed(bottom)))
    bm.faces.new(top)
    count = len(outline)
    for index in range(count):
        following = (index + 1) % count
        bm.faces.new([bottom[index], bottom[following], top[following], top[index]])
    verts = bottom + top
    _transform_new(bm, verts, matrix)
    return verts


def smooth_path(points, subdivisions: int = 6):
    vectors = [Vector(point) for point in points]
    if len(vectors) < 3:
        return vectors
    extended = [vectors[0] * 2 - vectors[1]] + vectors + [vectors[-1] * 2 - vectors[-2]]
    result = []
    for index in range(1, len(extended) - 2):
        p0, p1, p2, p3 = extended[index - 1 : index + 3]
        for step in range(subdivisions):
            t = step / subdivisions
            t2, t3 = t * t, t * t * t
            result.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    result.append(vectors[-1])
    return result


def add_sweep(bm, path, radius, segments: int = 12, cap: bool = True):
    points = [Vector(point) for point in path]
    radii = radius if isinstance(radius, (list, tuple)) else [radius] * len(points)
    tangents = []
    for index in range(len(points)):
        before = points[max(index - 1, 0)]
        after = points[min(index + 1, len(points) - 1)]
        tangents.append((after - before).normalized())
    reference = Vector((0.0, 0.0, 1.0)) if abs(tangents[0].z) < 0.9 else Vector((0.0, 1.0, 0.0))
    normal = tangents[0].cross(reference).normalized()
    rings = []
    for index, (point, tangent) in enumerate(zip(points, tangents)):
        if index > 0:
            rotation = tangents[index - 1].rotation_difference(tangent)
            normal = (rotation @ normal).normalized()
        binormal = tangent.cross(normal).normalized()
        ring = []
        for step in range(segments):
            angle = 2.0 * math.pi * step / segments
            offset = (normal * math.cos(angle) + binormal * math.sin(angle)) * radii[index]
            ring.append(bm.verts.new(point + offset))
        rings.append(ring)
    for index in range(len(rings) - 1):
        for step in range(segments):
            following = (step + 1) % segments
            bm.faces.new([rings[index][step], rings[index][following], rings[index + 1][following], rings[index + 1][step]])
    if cap:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
    return [vert for ring in rings for vert in ring]


def add_loft(bm, rings, cap_start: bool = True, cap_end: bool = True):
    vert_rings = [[bm.verts.new(Vector(point)) for point in ring] for ring in rings]
    count = len(vert_rings[0])
    for index in range(len(vert_rings) - 1):
        for step in range(count):
            following = (step + 1) % count
            bm.faces.new([vert_rings[index][step], vert_rings[index][following], vert_rings[index + 1][following], vert_rings[index + 1][step]])
    if cap_start:
        bm.faces.new(list(reversed(vert_rings[0])))
    if cap_end:
        bm.faces.new(vert_rings[-1])
    return [vert for ring in vert_rings for vert in ring]


def helix_path(radius: float, height: float, turns: float, points_per_turn: int = 24):
    total = max(int(turns * points_per_turn), 2)
    return [
        Vector((radius * math.cos(2 * math.pi * turns * i / total), radius * math.sin(2 * math.pi * turns * i / total), height * i / total))
        for i in range(total + 1)
    ]


def add_coil_spring(bm, mean_radius: float, wire_radius: float, height: float, turns: float, matrix: Matrix = Matrix()):
    path = helix_path(mean_radius, height, turns)
    verts = add_sweep(bm, path, wire_radius, segments=8)
    _transform_new(bm, verts, matrix)
    return verts


_materials: dict[str, bpy.types.Material] = {}


def material(name: str, colour) -> bpy.types.Material:
    if name in _materials:
        return _materials[name]
    created = bpy.data.materials.new(name)
    created.diffuse_color = (*colour, 1.0)
    created.use_nodes = True
    principled = created.node_tree.nodes.get("Principled BSDF")
    if principled:
        principled.inputs["Base Color"].default_value = (*colour, 1.0)
        principled.inputs["Roughness"].default_value = 0.55
    _materials[name] = created
    return created


def build_object(name: str, bm, collection, parent=None, material_ref=None, smooth: bool = False):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    if smooth:
        mesh.shade_smooth()
    mesh_object = bpy.data.objects.new(name, mesh)
    collection.objects.link(mesh_object)
    if parent is not None:
        mesh_object.parent = parent
    if material_ref is not None:
        mesh.materials.append(material_ref)
    return mesh_object


def build_empty(name: str, collection, parent=None):
    empty = bpy.data.objects.new(name, None)
    empty.empty_display_type = "PLAIN_AXES"
    collection.objects.link(empty)
    if parent is not None:
        empty.parent = parent
    return empty
