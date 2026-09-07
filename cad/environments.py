"""
The room the task happens in.

A task already says where it is — `scenario` is a uint8 on chain, indexing the
vocabulary in lib/chain.ts. Until now that index changed a word in the sidebar
and nothing else: every run, kitchen or workshop, was recorded against the same
bare grey table.

Each environment below is the work surface plus enough of its room to say which
room it is. Generated from named dimensions like everything else here, so there
is no asset to lose and no modelling package in the loop.

Convention, shared with props: millimetres, Z-up, origin at the centre of the
work surface, and the top of that surface at z = 0 — so a prop placed at z = 0
sits on it rather than in it.

    python3 cad/environments.py

Writes public/environments/<id>.glb and public/environments/index.json.
"""

from __future__ import annotations

import json
import math
import os

from kernel import Mesh, Node, extrude, revolve, rounded_rect, tube, write_glb

OUT = os.path.join(os.path.dirname(__file__), "..", "public", "environments")

MATERIALS = {
    "oak":      {"color": [0.478, 0.376, 0.267, 1.0], "metallic": 0.00, "roughness": 0.78},
    "walnut":   {"color": [0.325, 0.235, 0.169, 1.0], "metallic": 0.00, "roughness": 0.72},
    "birch":    {"color": [0.780, 0.702, 0.565, 1.0], "metallic": 0.00, "roughness": 0.74},
    "steel":    {"color": [0.694, 0.706, 0.718, 1.0], "metallic": 0.82, "roughness": 0.30},
    "graphite": {"color": [0.180, 0.184, 0.192, 1.0], "metallic": 0.24, "roughness": 0.52},
    "slate":    {"color": [0.286, 0.298, 0.310, 1.0], "metallic": 0.06, "roughness": 0.62},
    "tile":     {"color": [0.867, 0.855, 0.827, 1.0], "metallic": 0.02, "roughness": 0.24},
    "porcelain":{"color": [0.945, 0.941, 0.925, 1.0], "metallic": 0.02, "roughness": 0.20},
    "paint":    {"color": [0.612, 0.616, 0.600, 1.0], "metallic": 0.00, "roughness": 0.86},
    "felt":     {"color": [0.361, 0.443, 0.408, 1.0], "metallic": 0.00, "roughness": 0.94},
    "rubber":   {"color": [0.145, 0.153, 0.161, 1.0], "metallic": 0.00, "roughness": 0.90},
    "brass":    {"color": [0.722, 0.588, 0.318, 1.0], "metallic": 0.88, "roughness": 0.34},
    "canvas":   {"color": [0.729, 0.690, 0.600, 1.0], "metallic": 0.00, "roughness": 0.92},
}

# The station's own table is 840 mm across the half-width; the work surface is
# sized to sit under it rather than fight it.
SURFACE_W = 980.0
SURFACE_D = 720.0


def box(w: float, d: float, h: float, r: float = 2.0) -> Mesh:
    """An axis-aligned slab, origin at its footprint centre, growing +Z."""
    return extrude(rounded_rect(w, d, min(r, min(w, d) / 2 - 0.01)), h)


def slab(w: float, d: float, h: float, z: float, r: float = 2.0) -> Mesh:
    return box(w, d, h, r).translate(0, 0, z)


def worktop(thickness: float = 38.0, w: float = SURFACE_W, d: float = SURFACE_D,
            overhang: float = 0.0) -> Mesh:
    """The surface itself. Its top is z = 0, so it hangs below the origin."""
    return slab(w + overhang, d + overhang, thickness, -thickness, r=6.0)


def legs(w: float, d: float, height: float, thick: float = 46.0,
         inset: float = 60.0) -> Mesh:
    """Four square legs from the underside of a surface down to the floor."""
    m = None
    for sx in (-1, 1):
        for sy in (-1, 1):
            leg = box(thick, thick, height).translate(
                sx * (w / 2 - inset - thick / 2),
                sy * (d / 2 - inset - thick / 2),
                -height,
            )
            m = leg if m is None else m + leg
    assert m is not None
    return m


def plinth(w: float, d: float, height: float) -> Mesh:
    """A closed cabinet base — cheaper to read than four legs on a worktop."""
    return box(w, d, height).translate(0, 0, -height)


def backsplash(w: float, h: float, z: float = 0.0, y: float | None = None,
               t: float = 24.0) -> Mesh:
    y = (SURFACE_D / 2 - t / 2) if y is None else y
    return box(w, t, h).translate(0, y, z)


# --------------------------------------------------------------------------- rooms

def kitchen() -> Node:
    """A run of counter with a splashback and a wall cabinet above it."""
    n = Node("kitchen")
    n.add(Node("counter", worktop(40.0), "birch"))
    n.add(Node("cabinet", plinth(SURFACE_W - 40, SURFACE_D - 60, 860.0).translate(0, -10, 0), "oak"))

    wall = backsplash(SURFACE_W, 520.0)
    n.add(Node("splashback", wall, "tile"))

    # Wall unit, clear of the arm's reach so it reads as depth rather than a lid.
    n.add(Node("wall_unit", box(SURFACE_W - 120, 300.0, 380.0)
               .translate(0, SURFACE_D / 2 - 170, 620.0), "oak"))
    n.add(Node("rail", tube(9.0, 6.0, SURFACE_W - 220).rotate_y(90)
               .translate(0, SURFACE_D / 2 - 46, 560.0), "brass"))
    return n


def office() -> Node:
    """A desk with a monitor and a cable tray under the lip."""
    n = Node("office")
    n.add(Node("desk", worktop(30.0), "walnut"))
    n.add(Node("legs", legs(SURFACE_W, SURFACE_D, 700.0, 40.0, 70.0), "graphite"))

    n.add(Node("monitor_foot", box(220.0, 160.0, 16.0)
               .translate(0, SURFACE_D / 2 - 130, 0), "graphite"))
    n.add(Node("monitor_stem", box(48.0, 32.0, 200.0)
               .translate(0, SURFACE_D / 2 - 130, 16.0), "graphite"))
    n.add(Node("monitor", box(620.0, 26.0, 360.0)
               .translate(0, SURFACE_D / 2 - 120, 216.0), "slate"))
    n.add(Node("cable_tray", box(560.0, 90.0, 10.0)
               .translate(0, -SURFACE_D / 2 + 120, -140.0), "steel"))
    return n


def bathroom() -> Node:
    """A vanity top with a basin recess and a mirror behind."""
    n = Node("bathroom")
    n.add(Node("vanity", worktop(34.0), "porcelain"))
    n.add(Node("unit", plinth(SURFACE_W - 60, SURFACE_D - 80, 800.0), "paint"))
    n.add(Node("splashback", backsplash(SURFACE_W, 420.0), "tile"))
    n.add(Node("mirror", box(520.0, 14.0, 620.0)
               .translate(0, SURFACE_D / 2 - 26, 300.0), "steel"))

    # Basin, off to one side so it is scenery rather than an obstacle.
    basin = revolve([(0.0, -6.0), (150.0, -6.0), (150.0, -96.0), (120.0, -110.0), (0.0, -110.0)])
    n.add(Node("basin", basin.translate(-300.0, 40.0, 0.0), "porcelain"))
    n.add(Node("tap", tube(11.0, 8.0, 180.0).translate(-300.0, 170.0, 0.0), "steel"))
    return n


def workshop() -> Node:
    """A bench with a steel frame, a pegboard and a vice."""
    n = Node("workshop")
    n.add(Node("bench", worktop(56.0), "oak"))
    n.add(Node("frame", legs(SURFACE_W, SURFACE_D, 760.0, 52.0, 40.0), "steel"))
    n.add(Node("stretcher", box(SURFACE_W - 180, 40.0, 40.0).translate(0, 0, -640.0), "steel"))
    n.add(Node("pegboard", backsplash(SURFACE_W, 560.0), "birch"))

    # A grid of holes reads as pegboard without modelling every hole.
    for i in range(-4, 5):
        for k in range(3):
            n.add(Node(f"peg_{i}_{k}", tube(7.0, 4.5, 26.0, 10).rotate_x(90)
                       .translate(i * 92.0, SURFACE_D / 2 - 24, 140.0 + k * 130.0), "graphite"))

    n.add(Node("vice", box(150.0, 110.0, 90.0)
               .translate(-SURFACE_W / 2 + 140, -140.0, 0.0), "steel"))
    return n


def home() -> Node:
    """A sideboard with a shelf below and a lamp at one end."""
    n = Node("home")
    n.add(Node("top", worktop(32.0, overhang=30.0), "walnut"))
    n.add(Node("carcass", plinth(SURFACE_W - 80, SURFACE_D - 90, 720.0), "walnut"))
    n.add(Node("shelf", box(SURFACE_W - 120, SURFACE_D - 130, 20.0).translate(0, 0, -380.0), "oak"))
    n.add(Node("wall", backsplash(SURFACE_W + 120, 700.0, y=SURFACE_D / 2 + 40, t=30.0), "paint"))

    lamp = revolve([(0.0, 0.0), (74.0, 0.0), (74.0, 14.0), (16.0, 20.0), (16.0, 240.0), (0.0, 240.0)])
    n.add(Node("lamp_base", lamp.translate(SURFACE_W / 2 - 150, 150.0, 0.0), "brass"))
    n.add(Node("shade", revolve([(0.0, 0.0), (110.0, 0.0), (78.0, 150.0), (0.0, 150.0)])
               .translate(SURFACE_W / 2 - 150, 150.0, 240.0), "canvas"))
    return n


def play() -> Node:
    """A low play table with a felt mat and a toy bin beside it."""
    n = Node("play")
    n.add(Node("table", worktop(28.0), "birch"))
    n.add(Node("mat", box(SURFACE_W - 180, SURFACE_D - 160, 4.0).translate(0, 0, 0.0), "felt"))
    n.add(Node("legs", legs(SURFACE_W, SURFACE_D, 520.0, 56.0, 80.0), "birch"))
    n.add(Node("bin", box(300.0, 300.0, 260.0)
               .translate(SURFACE_W / 2 + 210, -100.0, -260.0), "rubber"))
    n.add(Node("wall", backsplash(SURFACE_W + 200, 640.0, y=SURFACE_D / 2 + 60, t=30.0), "paint"))
    return n


def general() -> Node:
    """A plain calibration bench. What a task with no stated room gets."""
    n = Node("general")
    n.add(Node("bench", worktop(36.0), "slate"))
    n.add(Node("legs", legs(SURFACE_W, SURFACE_D, 720.0, 48.0, 56.0), "steel"))
    n.add(Node("backboard", backsplash(SURFACE_W, 360.0), "graphite"))
    # A datum strip along the back edge: this is the room for measuring in.
    for i in range(-4, 5):
        n.add(Node(f"tick_{i}", box(4.0, 18.0, 60.0)
                   .translate(i * 100.0, SURFACE_D / 2 - 40, 12.0), "steel"))
    return n


# Keyed by the scenario name in lib/chain.ts. The index on chain picks the room.
ENVIRONMENTS = {
    "general":  (general,  "Calibration bench", "A plain bench with a datum strip. What a task with no stated room gets."),
    "kitchen":  (kitchen,  "Kitchen counter",   "A run of counter with a splashback and a wall cabinet."),
    "office":   (office,   "Office desk",       "A desk with a monitor and a cable tray."),
    "bathroom": (bathroom, "Bathroom vanity",   "A vanity top with a basin and a mirror."),
    "workshop": (workshop, "Workbench",         "A steel-framed bench with a pegboard and a vice."),
    "home":     (home,     "Sideboard",         "A sideboard with a lower shelf and a lamp."),
    "play":     (play,     "Play table",        "A low table with a felt mat and a toy bin."),
}


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    index = []
    for eid, (fn, label, blurb) in ENVIRONMENTS.items():
        root = Node("root")
        root.add(fn())
        path = os.path.join(OUT, f"{eid}.glb")
        write_glb(root, MATERIALS, path)
        size = os.path.getsize(path)
        index.append({"id": eid, "label": label, "blurb": blurb,
                      "surfaceWidthMm": SURFACE_W, "surfaceDepthMm": SURFACE_D,
                      "url": f"/environments/{eid}.glb", "bytes": size})
        print(f"  {eid:10} {label:20} {size:>8} B")
    with open(os.path.join(OUT, "index.json"), "w") as f:
        json.dump({"environments": index}, f, indent=2)
    print(f"\n{len(index)} environments -> public/environments/")


if __name__ == "__main__":
    main()
