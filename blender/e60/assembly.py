from contextlib import contextmanager

import bmesh
import bpy

from lib.geom import build_empty, build_object, material

MATERIAL_COLOURS = {
    "aluminium": (0.72, 0.73, 0.74),
    "cast-iron": (0.32, 0.33, 0.34),
    "steel": (0.52, 0.53, 0.55),
    "black-plastic": (0.06, 0.06, 0.07),
    "rubber": (0.03, 0.03, 0.03),
    "paint": (0.12, 0.16, 0.24),
    "glass": (0.55, 0.65, 0.72),
    "copper": (0.62, 0.38, 0.20),
    "brake-disc": (0.42, 0.42, 0.43),
    "caliper": (0.30, 0.30, 0.32),
    "exhaust": (0.45, 0.40, 0.35),
}


class Assembly:
    def __init__(self, root_name: str):
        self.collection = bpy.data.collections.new(root_name)
        bpy.context.scene.collection.children.link(self.collection)
        self.root = build_empty(root_name, self.collection)
        self.system_roots: dict[str, bpy.types.Object] = {}
        self.part_names: list[str] = []

    def system_root(self, system_id: str):
        if system_id not in self.system_roots:
            self.system_roots[system_id] = build_empty(f"system__{system_id}", self.collection, self.root)
        return self.system_roots[system_id]

    @contextmanager
    def part(self, name: str, system_id: str, material_name: str, smooth: bool = False):
        if name in self.part_names:
            raise ValueError(f"duplicate part name {name}")
        bm = bmesh.new()
        yield bm
        if len(bm.verts) == 0:
            bm.free()
            raise ValueError(f"part {name} has no geometry")
        build_object(
            name,
            bm,
            self.collection,
            parent=self.system_root(system_id),
            material_ref=material(material_name, MATERIAL_COLOURS[material_name]),
            smooth=smooth,
        )
        self.part_names.append(name)
