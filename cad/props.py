"""
The props a task actually names.

Task #0 says "put the toothpaste into the upper drawer" and the station drew a
grey cylinder on a bare table. The instruction and the scene had nothing to do
with each other, which makes every recorded trajectory a demonstration of
moving an anonymous puck.

Every prop below is generated from named dimensions, the same way the arm is —
there is no modelling package in the loop and no asset to lose. Millimetres,
Z-up, origin at the footprint centre so the station can place one by its base.

    python3 cad/props.py

Writes public/props/<id>.glb and public/props/index.json.
"""

from __future__ import annotations

import json
import math
import os

import numpy as np

from kernel import Mesh, Node, extrude, revolve, rounded_rect, tube, write_glb

OUT = os.path.join(os.path.dirname(__file__), "..", "public", "props")

MATERIALS = {
    "ceramic": {"color": [0.898, 0.894, 0.878, 1.0], "metallic": 0.02, "roughness": 0.38},
    "plastic": {"color": [0.831, 0.310, 0.243, 1.0], "metallic": 0.00, "roughness": 0.52},
    "mint":    {"color": [0.412, 0.780, 0.706, 1.0], "metallic": 0.00, "roughness": 0.46},
    "card":    {"color": [0.678, 0.576, 0.427, 1.0], "metallic": 0.00, "roughness": 0.88},
    "steel":   {"color": [0.694, 0.706, 0.718, 1.0], "metallic": 0.82, "roughness": 0.28},
    "dark":    {"color": [0.106, 0.106, 0.110, 1.0], "metallic": 0.30, "roughness": 0.44},
    "glass":   {"color": [0.847, 0.878, 0.859, 1.0], "metallic": 0.10, "roughness": 0.14},
    "amber":   {"color": [0.855, 0.545, 0.129, 1.0], "metallic": 0.05, "roughness": 0.32},
    "bone":    {"color": [0.925, 0.906, 0.855, 1.0], "metallic": 0.00, "roughness": 0.62},
    "wood":    {"color": [0.451, 0.353, 0.259, 1.0], "metallic": 0.00, "roughness": 0.80},
    "shell":   {"color": [0.878, 0.882, 0.871, 1.0], "metallic": 0.04, "roughness": 0.48},
}


def box(w: float, d: float, h: float, r: float = 0.0) -> Mesh:
    """A slab. A radius rounds it in plan, which is what most real objects do."""
    return extrude(rounded_rect(w, d, r if r > 0 else 0.001, 6), h)


def cyl(r: float, h: float, seg: int = 40) -> Mesh:
    return revolve([(0, 0), (r, 0), (r, h), (0, h)], seg)


# --------------------------------------------------------------------- props

def mug() -> Node:
    """Straight-walled mug with a real handle sweep."""
    R, H, T = 41.0, 95.0, 3.4
    body = revolve([(0, 0), (R, 0), (R, H), (R - T, H), (R - T, 6), (0, 6)], 56)
    n = Node("mug", body, "ceramic")
    # handle: a torus arc swept in the XZ plane, approximated by short tubes
    for i in range(14):
        a0 = math.radians(-78 + i * 156 / 13)
        cx, cz = R - 2 + 26 * math.cos(a0), H * 0.56 + 26 * math.sin(a0)
        n.add(Node(f"handle_{i}", cyl(4.6, 7.4, 14).rotate_x(90).translate(cx, 0, cz), "ceramic"))
    return n


def bottle() -> Node:
    prof = [(0, 0), (33, 0), (33, 96), (25, 128), (12, 150), (12, 186), (0, 186)]
    n = Node("bottle", revolve(prof, 52), "glass")
    n.add(Node("cap", cyl(13.5, 15, 32).translate(0, 0, 186), "plastic"))
    return n


def toothpaste() -> Node:
    """A flattened tube with a crimped tail and a screw cap."""
    body = extrude(rounded_rect(34, 17, 8, 8), 132)
    n = Node("toothpaste", body, "mint")
    n.add(Node("crimp", box(36, 4, 9, 1.4).translate(0, 0, 132), "mint"))
    n.add(Node("neck", cyl(7.5, 11, 24), "plastic"))
    n.add(Node("cap", cyl(9.5, 13, 24).translate(0, 0, -13), "plastic"))
    return n


def drawer() -> Node:
    """An open drawer box: four walls and a floor, so a payload can go *into* it."""
    W, D, H, T = 190.0, 140.0, 62.0, 7.0
    n = Node("drawer", box(W, D, T, 3), "wood")
    n.add(Node("back",  box(W, T, H, 1).translate(0, (D - T) / 2, 0), "wood"))
    n.add(Node("front", box(W, T, H, 1).translate(0, -(D - T) / 2, 0), "wood"))
    n.add(Node("left",  box(T, D, H, 1).translate(-(W - T) / 2, 0, 0), "wood"))
    n.add(Node("right", box(T, D, H, 1).translate((W - T) / 2, 0, 0), "wood"))
    n.add(Node("pull",  cyl(6, 26, 20).rotate_y(90).translate(0, -(D / 2 + 8), H * 0.62), "steel"))
    return n


def shelf() -> Node:
    W, D, T, LEG = 200.0, 120.0, 9.0, 74.0
    n = Node("shelf", box(W, D, T, 2).translate(0, 0, LEG), "wood")
    for sx in (-1, 1):
        n.add(Node(f"leg_{sx}", box(10, D, LEG, 1).translate(sx * (W - 10) / 2, 0, 0), "wood"))
    return n


def dice() -> Node:
    S, R = 42.0, 4.0
    n = Node("dice", box(S, S, S, R), "bone")
    # pips on the top face, four of them, so "rotate to show four" has a face to show
    for dx, dy in ((-10, -10), (10, -10), (-10, 10), (10, 10)):
        n.add(Node(f"pip_{dx}_{dy}", cyl(4.2, 1.2, 16).translate(dx, dy, S), "dark"))
    return n


def pen() -> Node:
    n = Node("pen", cyl(5.2, 138, 24), "dark")
    n.add(Node("grip", cyl(6.0, 26, 24).translate(0, 0, 14), "plastic"))
    n.add(Node("tip", revolve([(0, 0), (5.2, 0), (1.2, 13), (0, 13)], 24).translate(0, 0, -13), "steel"))
    n.add(Node("clip", box(3, 2.4, 34, 0.8).translate(0, 6, 100), "steel"))
    return n


def pen_cup() -> Node:
    n = Node("pen_cup", tube(38.0, 34.0, 96.0, 44), "steel")
    n.add(Node("base", cyl(38, 4, 44), "steel"))
    return n


def eraser() -> Node:
    return Node("eraser", box(46, 22, 14, 2.5), "plastic")


def jar() -> Node:
    prof = [(0, 0), (38, 0), (38, 84), (29, 100), (29, 112), (0, 112)]
    n = Node("jar", revolve(prof, 48), "amber")
    n.add(Node("lid", cyl(31.5, 14, 36).translate(0, 0, 112), "dark"))
    return n


def toast() -> Node:
    """Bread is a rounded rect with a domed crown — extrude then a shallow cap."""
    n = Node("toast", extrude(rounded_rect(96, 92, 26, 10), 14), "card")
    n.add(Node("crown", extrude(rounded_rect(72, 68, 30, 10), 5).translate(0, 0, 14), "card"))
    return n


def laptop() -> Node:
    n = Node("laptop", box(230, 158, 11, 5), "dark")
    n.add(Node("lid", box(230, 158, 7, 5).translate(0, 0, 11), "steel"))
    return n


def air_fryer() -> Node:
    n = Node("air_fryer", revolve([(0, 0), (78, 0), (82, 40), (82, 168), (0, 168)], 44), "dark")
    n.add(Node("basket", box(96, 74, 62, 8).translate(0, -66, 24), "dark"))
    n.add(Node("handle", box(84, 12, 16, 5).translate(0, -108, 58), "steel"))
    n.add(Node("dial", cyl(19, 8, 28).rotate_x(-90).translate(0, -84, 132), "steel"))
    return n


def apricot() -> Node:
    n = Node("apricot", revolve([(0, 0), (17, 4), (25, 20), (24, 36), (14, 46), (0, 47)], 40), "amber")
    n.add(Node("stem", cyl(1.8, 9, 10).translate(0, 0, 45), "wood"))
    return n


def shrimp() -> Node:
    """A tapered arc — six shrinking segments swept along a quarter circle."""
    n = Node("shrimp", None, "plastic")
    for i in range(7):
        t = i / 6
        a = math.radians(112 * t - 10)
        r = 10.5 * (1 - 0.62 * t) + 2.0
        n.add(Node(f"seg_{i}", cyl(r, 11, 20).rotate_x(90)
                   .translate(34 * math.cos(a) - 20, 0, 34 * math.sin(a) + 4), "plastic"))
    return n


def crate() -> Node:
    W, D, H, T = 150.0, 150.0, 90.0, 8.0
    n = Node("crate", box(W, D, T, 2), "wood")
    for name, (w, d, x, y) in {
        "back": (W, T, 0, (D - T) / 2), "front": (W, T, 0, -(D - T) / 2),
        "left": (T, D, -(W - T) / 2, 0), "right": (T, D, (W - T) / 2, 0),
    }.items():
        n.add(Node(name, box(w, d, H, 1).translate(x, y, 0), "wood"))
    return n


PROPS = {
    "mug":        (mug,        "Mug",         "kitchen",  "payload", 82),
    "bottle":     (bottle,     "Bottle",      "kitchen",  "payload", 66),
    "toothpaste": (toothpaste, "Toothpaste",  "bathroom", "payload", 34),
    "dice":       (dice,       "Dice",        "play",     "payload", 42),
    "pen":        (pen,        "Pen",         "office",   "payload", 12),
    "eraser":     (eraser,     "Eraser",      "office",   "payload", 46),
    "jar":        (jar,        "Honey jar",   "kitchen",  "payload", 76),
    "toast":      (toast,      "Toast",       "kitchen",  "payload", 96),
    "apricot":    (apricot,    "Apricot",     "kitchen",  "payload", 50),
    "shrimp":     (shrimp,     "Shrimp",      "kitchen",  "payload", 48),
    "drawer":     (drawer,     "Drawer",      "home",     "target",  190),
    "shelf":      (shelf,      "Shelf",       "home",     "target",  200),
    "pen_cup":    (pen_cup,    "Pen cup",     "office",   "target",  76),
    "crate":      (crate,      "Crate",       "workshop", "target",  150),
    "laptop":     (laptop,     "Laptop",      "office",   "target",  230),
    "air_fryer":  (air_fryer,  "Air fryer",   "kitchen",  "target",  164),
}


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    index = []
    for pid, (fn, label, scenario, role, width) in PROPS.items():
        root = Node("root")
        root.add(fn())
        path = os.path.join(OUT, f"{pid}.glb")
        write_glb(root, MATERIALS, path)
        index.append({"id": pid, "label": label, "scenario": scenario,
                      "role": role, "widthMm": width,
                      "url": f"/props/{pid}.glb",
                      "bytes": os.path.getsize(path)})
        print(f"  {pid:12} {label:12} {role:8} {os.path.getsize(path):>7} B")
    with open(os.path.join(OUT, "index.json"), "w") as f:
        json.dump({"props": index}, f, indent=2)
    print(f"\n{len(index)} props -> public/props/")


if __name__ == "__main__":
    main()
