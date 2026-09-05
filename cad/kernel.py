"""
Geometry + glTF kernel for the Axon arm.

No CSG, no external CAD dependency. Every part is built from a surface of
revolution or a swept polygon, which keeps parts manifold by construction:
a closed profile revolved a whole turn cannot produce a boundary edge, and a
swept polygon is capped at both ends. numpy is the only import.

Units are millimetres throughout. The glTF writer converts to metres on export
because glTF declares metres and three.js scene units follow it.
"""

from __future__ import annotations

import json
import struct
from typing import Iterable

import numpy as np

MM = 0.001  # millimetre -> metre, applied once at export


# --------------------------------------------------------------------------
# Mesh
# --------------------------------------------------------------------------


class Mesh:
    """Triangle soup with per-vertex normals, welded on construction."""

    def __init__(self, verts: np.ndarray, faces: np.ndarray):
        self.verts = np.asarray(verts, dtype=np.float64).reshape(-1, 3)
        self.faces = np.asarray(faces, dtype=np.int64).reshape(-1, 3)

    def __add__(self, other: "Mesh") -> "Mesh":
        return Mesh(
            np.vstack([self.verts, other.verts]),
            np.vstack([self.faces, other.faces + len(self.verts)]),
        )

    def translate(self, x=0.0, y=0.0, z=0.0) -> "Mesh":
        return Mesh(self.verts + np.array([x, y, z]), self.faces)

    def rotate_x(self, deg: float) -> "Mesh":
        t = np.radians(deg)
        m = np.array([[1, 0, 0], [0, np.cos(t), -np.sin(t)], [0, np.sin(t), np.cos(t)]])
        return Mesh(self.verts @ m.T, self.faces)

    def rotate_y(self, deg: float) -> "Mesh":
        t = np.radians(deg)
        m = np.array([[np.cos(t), 0, np.sin(t)], [0, 1, 0], [-np.sin(t), 0, np.cos(t)]])
        return Mesh(self.verts @ m.T, self.faces)

    def scale(self, sx=1.0, sy=None, sz=None) -> "Mesh":
        sy = sx if sy is None else sy
        sz = sx if sz is None else sz
        return Mesh(self.verts * np.array([sx, sy, sz]), self.faces)

    # -- validation --------------------------------------------------------

    def edge_report(self) -> dict:
        """Every edge of a closed surface is shared by exactly two triangles."""
        e = np.vstack(
            [self.faces[:, [0, 1]], self.faces[:, [1, 2]], self.faces[:, [2, 0]]]
        )
        e = np.sort(e, axis=1)
        _, counts = np.unique(e, axis=0, return_counts=True)
        return {
            "verts": len(self.verts),
            "tris": len(self.faces),
            "boundary_edges": int((counts == 1).sum()),
            "nonmanifold_edges": int((counts > 2).sum()),
        }

    def is_closed(self) -> bool:
        r = self.edge_report()
        return r["boundary_edges"] == 0 and r["nonmanifold_edges"] == 0

    def vertex_normals(self) -> np.ndarray:
        n = np.zeros_like(self.verts)
        a, b, c = (self.verts[self.faces[:, i]] for i in range(3))
        fn = np.cross(b - a, c - a)
        for i in range(3):
            np.add.at(n, self.faces[:, i], fn)
        ln = np.linalg.norm(n, axis=1, keepdims=True)
        ln[ln == 0] = 1.0
        return n / ln


# --------------------------------------------------------------------------
# Generators
# --------------------------------------------------------------------------


def revolve(profile: Iterable[tuple[float, float]], seg: int = 64) -> Mesh:
    """
    Revolve a (radius, z) profile a full turn about +Z.

    The profile is an open polyline read bottom to top. Radius 0 at either end
    is treated as a pole and collapses to a single vertex, which is what keeps
    domed and flat-capped parts closed without a separate cap step.
    """
    prof = [(float(r), float(z)) for r, z in profile]
    if len(prof) < 2:
        raise ValueError("a profile needs at least two points")

    rings: list[np.ndarray] = []
    ring_is_pole: list[bool] = []
    ang = np.linspace(0.0, 2.0 * np.pi, seg, endpoint=False)

    for r, z in prof:
        if abs(r) < 1e-9:
            rings.append(np.array([[0.0, 0.0, z]]))
            ring_is_pole.append(True)
        else:
            rings.append(np.column_stack([r * np.cos(ang), r * np.sin(ang), np.full(seg, z)]))
            ring_is_pole.append(False)

    offsets, verts = [], []
    for ring in rings:
        offsets.append(sum(len(v) for v in verts))
        verts.append(ring)
    V = np.vstack(verts)

    faces: list[tuple[int, int, int]] = []
    for i in range(len(rings) - 1):
        lo, hi = offsets[i], offsets[i + 1]
        lo_pole, hi_pole = ring_is_pole[i], ring_is_pole[i + 1]
        for s in range(seg):
            s2 = (s + 1) % seg
            if lo_pole and hi_pole:
                continue
            if lo_pole:
                faces.append((lo, hi + s, hi + s2))
            elif hi_pole:
                faces.append((lo + s, lo + s2, hi))
            else:
                faces.append((lo + s, lo + s2, hi + s2))
                faces.append((lo + s, hi + s2, hi + s))

    # Flat ends (non-zero radius at the extremes) need a fan to close the shell.
    if not ring_is_pole[0]:
        c = len(V)
        V = np.vstack([V, [0.0, 0.0, prof[0][1]]])
        for s in range(seg):
            faces.append((offsets[0] + (s + 1) % seg, offsets[0] + s, c))
    if not ring_is_pole[-1]:
        c = len(V)
        V = np.vstack([V, [0.0, 0.0, prof[-1][1]]])
        for s in range(seg):
            faces.append((offsets[-1] + s, offsets[-1] + (s + 1) % seg, c))

    return Mesh(V, np.array(faces))


def extrude(poly: Iterable[tuple[float, float]], h: float) -> Mesh:
    """Sweep a closed CCW polygon in the XY plane along +Z by h, capped."""
    p = np.array([[float(x), float(y)] for x, y in poly])
    n = len(p)
    if n < 3:
        raise ValueError("a polygon needs at least three points")

    bottom = np.column_stack([p, np.zeros(n)])
    top = np.column_stack([p, np.full(n, h)])
    V = np.vstack([bottom, top])

    faces: list[tuple[int, int, int]] = []
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, n + j))
        faces.append((i, n + j, n + i))

    # Fan the caps from the centroid so concave outlines stay valid.
    cb, ct = len(V), len(V) + 1
    cx, cy = p[:, 0].mean(), p[:, 1].mean()
    V = np.vstack([V, [cx, cy, 0.0], [cx, cy, h]])
    for i in range(n):
        j = (i + 1) % n
        faces.append((j, i, cb))
        faces.append((n + i, n + j, ct))

    return Mesh(V, np.array(faces))


def rounded_rect(w: float, d: float, r: float, seg: int = 8) -> list[tuple[float, float]]:
    """CCW outline of a w x d rectangle with radius-r corners, centred on origin."""
    hw, hd = w / 2 - r, d / 2 - r
    pts: list[tuple[float, float]] = []
    for cx, cy, a0 in ((hw, hd, 0.0), (-hw, hd, 90.0), (-hw, -hd, 180.0), (hw, -hd, 270.0)):
        for k in range(seg + 1):
            a = np.radians(a0 + 90.0 * k / seg)
            pts.append((cx + r * np.cos(a), cy + r * np.sin(a)))
    return pts


def tube(r_outer: float, r_inner: float, h: float, seg: int = 48) -> Mesh:
    """A closed annular tube — the collar ring at each joint."""
    return revolve(
        [(r_inner, 0.0), (r_outer, 0.0), (r_outer, h), (r_inner, h), (r_inner, 0.0)],
        seg=seg,
    )


# --------------------------------------------------------------------------
# glTF / GLB writer
# --------------------------------------------------------------------------


class Node:
    def __init__(self, name: str, mesh: Mesh | None = None, material: str = "shell",
                 translation=(0.0, 0.0, 0.0)):
        self.name = name
        self.mesh = mesh
        self.material = material
        self.translation = translation
        self.children: list["Node"] = []

    def add(self, child: "Node") -> "Node":
        self.children.append(child)
        return child


def _pad(b: bytearray, to: int = 4, fill: bytes = b"\x00") -> None:
    while len(b) % to:
        b += fill


def write_glb(root: Node, materials: dict[str, dict], path: str) -> None:
    """
    Serialize a node tree to a single binary glTF file.

    Joint nodes keep their names so the viewport can look them up by name and
    drive them directly; that is the whole reason the arm ships as a hierarchy
    rather than one welded mesh.
    """
    bin_blob = bytearray()
    accessors: list[dict] = []
    buffer_views: list[dict] = []
    meshes: list[dict] = []

    mat_names = list(materials.keys())
    gl_materials = []
    for name in mat_names:
        m = materials[name]
        gl_materials.append(
            {
                "name": name,
                "pbrMetallicRoughness": {
                    "baseColorFactor": m["color"],
                    "metallicFactor": m.get("metallic", 0.0),
                    "roughnessFactor": m.get("roughness", 0.6),
                },
                "doubleSided": False,
            }
        )

    def add_accessor(data: np.ndarray, comp_type: int, type_str: str, target: int) -> int:
        _pad(bin_blob)
        offset = len(bin_blob)
        raw = data.tobytes()
        bin_blob.extend(raw)
        buffer_views.append(
            {"buffer": 0, "byteOffset": offset, "byteLength": len(raw), "target": target}
        )
        acc: dict = {
            "bufferView": len(buffer_views) - 1,
            "componentType": comp_type,
            "count": int(len(data)),
            "type": type_str,
        }
        if type_str == "VEC3":
            acc["min"] = [float(x) for x in data.min(axis=0)]
            acc["max"] = [float(x) for x in data.max(axis=0)]
        accessors.append(acc)
        return len(accessors) - 1

    def add_mesh(mesh: Mesh, material: str) -> int:
        pos = (mesh.verts * MM).astype(np.float32)
        nrm = mesh.vertex_normals().astype(np.float32)
        idx = mesh.faces.reshape(-1).astype(np.uint32)
        p = add_accessor(pos, 5126, "VEC3", 34962)
        n = add_accessor(nrm, 5126, "VEC3", 34962)
        i = add_accessor(idx, 5125, "SCALAR", 34963)
        meshes.append(
            {
                "primitives": [
                    {
                        "attributes": {"POSITION": p, "NORMAL": n},
                        "indices": i,
                        "material": mat_names.index(material),
                    }
                ]
            }
        )
        return len(meshes) - 1

    gl_nodes: list[dict] = []

    def walk(node: Node) -> int:
        entry: dict = {"name": node.name}
        t = [c * MM for c in node.translation]
        if any(abs(c) > 1e-12 for c in t):
            entry["translation"] = t
        if node.mesh is not None:
            entry["mesh"] = add_mesh(node.mesh, node.material)
        gl_nodes.append(entry)
        me = len(gl_nodes) - 1
        if node.children:
            entry["children"] = [walk(c) for c in node.children]
        return me

    root_index = walk(root)

    gltf = {
        "asset": {"version": "2.0", "generator": "axon-cad"},
        "scene": 0,
        "scenes": [{"nodes": [root_index]}],
        "nodes": gl_nodes,
        "meshes": meshes,
        "materials": gl_materials,
        "accessors": accessors,
        "bufferViews": buffer_views,
        "buffers": [{"byteLength": len(bin_blob)}],
    }

    json_chunk = bytearray(json.dumps(gltf, separators=(",", ":")).encode("utf-8"))
    _pad(json_chunk, 4, b" ")
    _pad(bin_blob, 4, b"\x00")

    total = 12 + 8 + len(json_chunk) + 8 + len(bin_blob)
    with open(path, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, total))
        f.write(struct.pack("<II", len(json_chunk), 0x4E4F534A))
        f.write(json_chunk)
        f.write(struct.pack("<II", len(bin_blob), 0x004E4942))
        f.write(bin_blob)


def write_stl(mesh: Mesh, name: str, path: str) -> None:
    """Binary STL, for the parts that get printed rather than rendered."""
    tri = mesh.verts[mesh.faces]
    n = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    ln = np.linalg.norm(n, axis=1, keepdims=True)
    ln[ln == 0] = 1.0
    n = n / ln
    with open(path, "wb") as f:
        f.write(name.encode("ascii", "replace").ljust(80, b"\x00")[:80])
        f.write(struct.pack("<I", len(tri)))
        for i in range(len(tri)):
            f.write(struct.pack("<3f", *n[i]))
            for v in tri[i]:
                f.write(struct.pack("<3f", *v))
            f.write(b"\x00\x00")
