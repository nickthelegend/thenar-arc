"""
AXON-6 — the arm the teleoperation station drives.

Six revolute joints plus a parallel-jaw gripper. Every dimension below is a
named constant: change one and rerun this file, there is no CAD file to open.
The frame is Z-up with the base flange on Z=0, matching URDF convention; the
viewport rotates the loaded model into three.js' Y-up world.

    python3 cad/arm.py

Writes public/models/axon-6.glb (a named node hierarchy the viewport drives
joint by joint) and cad/exports/*.stl (one solid per printable part).
"""

from __future__ import annotations

import json
import os

from kernel import Mesh, Node, extrude, revolve, rounded_rect, tube, write_glb, write_stl

# ---------------------------------------------------------------------------
# Dimensions, millimetres. This block is the whole spec.
# ---------------------------------------------------------------------------

PLINTH_R, PLINTH_H = 132.0, 12.0     # granite pad the arm is bolted to
BASE_R, BASE_H = 78.0, 70.0          # pedestal, tapered
J1_Z = 70.0                          # base yaw axis height
SHOULDER_H = 96.0                    # yoke height above J1
L1 = 210.0                           # upper arm, J2 -> J3
L2 = 182.0                           # forearm, J3 -> J4
WRIST_H = 58.0                       # J4 -> J5
YOKE_H = 52.0                        # J5 -> J6
FLANGE_R, FLANGE_H = 34.0, 10.0      # tool flange

ARM_W, ARM_D, ARM_R = 88.0, 68.0, 20.0   # upper arm section
FORE_W, FORE_D, FORE_R = 74.0, 58.0, 17.0

COLLAR_T = 9.0                       # brass ring thickness at each joint
JOINT_R = 46.0                       # graphite joint barrel radius

FINGER_L, FINGER_W, FINGER_T = 62.0, 16.0, 11.0
GRIP_OPEN = 42.0                     # jaw separation, fully open
PAD_T = 3.0

SEG = 64                             # revolve resolution

MATERIALS = {
    # Pale structural shells, near-black joints, one orange ring per axis. The
    # orange is the only chromatic value on the arm and it marks exactly the
    # six places the operator can move — the same signal colour the interface
    # uses for anything live.
    "shell":   {"color": [0.878, 0.882, 0.871, 1.0], "metallic": 0.04, "roughness": 0.48},
    "joint":   {"color": [0.086, 0.086, 0.086, 1.0], "metallic": 0.40, "roughness": 0.42},
    "collar":  {"color": [1.000, 0.416, 0.000, 1.0], "metallic": 0.70, "roughness": 0.34},
    "pad":     {"color": [0.055, 0.055, 0.055, 1.0], "metallic": 0.00, "roughness": 0.90},
    "granite": {"color": [0.110, 0.110, 0.110, 1.0], "metallic": 0.08, "roughness": 0.76},
}


# ---------------------------------------------------------------------------
# Parts
# ---------------------------------------------------------------------------


def plinth() -> Mesh:
    return revolve(
        [(0, 0), (PLINTH_R, 0), (PLINTH_R, PLINTH_H - 3), (PLINTH_R - 4, PLINTH_H), (0, PLINTH_H)],
        SEG,
    )


def pedestal() -> Mesh:
    """Tapered column, waisted so the shoulder does not look bolted to a can."""
    return revolve(
        [
            (0, 0), (BASE_R, 0), (BASE_R, 14),
            (BASE_R - 10, 26), (BASE_R - 18, 44),
            (BASE_R - 16, 60), (BASE_R - 20, BASE_H), (0, BASE_H),
        ],
        SEG,
    )


def joint_barrel(h: float, r: float = JOINT_R) -> Mesh:
    """Graphite barrel with a chamfer at each end."""
    c = 4.0
    return revolve(
        [(0, 0), (r - c, 0), (r, c), (r, h - c), (r - c, h), (0, h)], SEG
    )


def collar(r: float = JOINT_R + 3.0) -> Mesh:
    return tube(r, r - 7.0, COLLAR_T, SEG)


def link(w: float, d: float, r: float, length: float) -> Mesh:
    return extrude(rounded_rect(w, d, r), length)


def shoulder_yoke() -> Mesh:
    body = link(ARM_W + 8, ARM_D + 8, ARM_R, SHOULDER_H)
    return body


def wrist_housing() -> Mesh:
    return revolve(
        [(0, 0), (38, 0), (38, WRIST_H - 8), (32, WRIST_H), (0, WRIST_H)], SEG
    )


def wrist_yoke() -> Mesh:
    return link(58.0, 46.0, 12.0, YOKE_H)


def flange() -> Mesh:
    return revolve(
        [(0, 0), (FLANGE_R, 0), (FLANGE_R, FLANGE_H - 2), (FLANGE_R - 3, FLANGE_H), (0, FLANGE_H)],
        SEG,
    )


def gripper_body() -> Mesh:
    return link(72.0, 40.0, 8.0, 34.0)


def finger() -> Mesh:
    """L-shaped jaw: a vertical blade with an inward-facing gripping face."""
    return link(FINGER_T, FINGER_W, 3.0, FINGER_L)


def finger_pad() -> Mesh:
    return link(PAD_T, FINGER_W - 2, 1.0, FINGER_L - 18)


# ---------------------------------------------------------------------------
# Assembly
# ---------------------------------------------------------------------------


def build() -> tuple[Node, dict[str, Mesh]]:
    parts: dict[str, Mesh] = {}

    def part(name: str, mesh: Mesh) -> Mesh:
        parts[name] = mesh
        return mesh

    root = Node("AXON-6")
    root.add(Node("plinth", part("plinth", plinth()), "granite", (0, 0, -PLINTH_H)))
    root.add(Node("pedestal", part("pedestal", pedestal()), "shell"))

    # J1 — base yaw, rotates about Z
    j1 = root.add(Node("J1_yaw", translation=(0, 0, J1_Z)))
    j1.add(Node("j1_collar", part("collar_j1", collar()), "collar", (0, 0, -COLLAR_T / 2)))
    j1.add(Node("j1_barrel", part("barrel_j1", joint_barrel(26.0)), "joint", (0, 0, 2)))
    j1.add(Node("shoulder", part("shoulder", shoulder_yoke()), "shell", (0, 0, 26)))

    # J2 — shoulder pitch, rotates about Y
    j2 = j1.add(Node("J2_pitch", translation=(0, 0, SHOULDER_H + 26)))
    j2.add(Node("j2_collar", part("collar_j2", collar()), "collar", (0, 0, -COLLAR_T / 2)))
    j2.add(Node("upper_arm", part("upper_arm", link(ARM_W, ARM_D, ARM_R, L1)), "shell"))

    # J3 — elbow pitch, rotates about Y
    j3 = j2.add(Node("J3_pitch", translation=(0, 0, L1)))
    j3.add(Node("j3_collar", part("collar_j3", collar(JOINT_R - 2)), "collar", (0, 0, -COLLAR_T / 2)))
    j3.add(Node("j3_barrel", part("barrel_j3", joint_barrel(22.0, JOINT_R - 6)), "joint", (0, 0, 1)))
    j3.add(Node("forearm", part("forearm", link(FORE_W, FORE_D, FORE_R, L2)), "shell", (0, 0, 22)))

    # J4 — forearm roll, rotates about Z
    j4 = j3.add(Node("J4_roll", translation=(0, 0, L2 + 22)))
    j4.add(Node("j4_collar", part("collar_j4", collar(40.0)), "collar", (0, 0, -COLLAR_T / 2)))
    j4.add(Node("wrist_housing", part("wrist_housing", wrist_housing()), "shell"))

    # J5 — wrist pitch, rotates about Y
    j5 = j4.add(Node("J5_pitch", translation=(0, 0, WRIST_H)))
    j5.add(Node("j5_collar", part("collar_j5", collar(34.0)), "collar", (0, 0, -COLLAR_T / 2)))
    j5.add(Node("wrist_yoke", part("wrist_yoke", wrist_yoke()), "shell"))

    # J6 — tool roll, rotates about Z
    j6 = j5.add(Node("J6_roll", translation=(0, 0, YOKE_H)))
    j6.add(Node("flange", part("flange", flange()), "joint"))
    j6.add(Node("j6_collar", part("collar_j6", collar(FLANGE_R + 2)), "collar", (0, 0, FLANGE_H)))
    j6.add(Node("gripper_body", part("gripper_body", gripper_body()), "shell", (0, 0, FLANGE_H)))

    # Jaws — prismatic along X, driven by the viewport as a pair
    jaw_z = FLANGE_H + 34.0
    for side, sign in (("left", -1.0), ("right", 1.0)):
        jaw = j6.add(Node(f"jaw_{side}", translation=(sign * GRIP_OPEN / 2, 0, jaw_z)))
        jaw.add(Node(f"finger_{side}", part(f"finger_{side}", finger()), "shell"))
        jaw.add(
            Node(
                f"pad_{side}",
                part(f"pad_{side}", finger_pad()),
                "pad",
                (-sign * (FINGER_T / 2 + PAD_T / 2), 0, 9),
            )
        )

    return root, parts


def main() -> None:
    here = os.path.dirname(os.path.abspath(__file__))
    repo = os.path.dirname(here)
    models = os.path.join(repo, "public", "models")
    exports = os.path.join(here, "exports")
    os.makedirs(models, exist_ok=True)
    os.makedirs(exports, exist_ok=True)

    root, parts = build()

    print(f"{'part':<16} {'verts':>7} {'tris':>7} {'bnd':>5} {'nonmf':>6}  status")
    print("-" * 56)
    bad = 0
    for name, mesh in parts.items():
        r = mesh.edge_report()
        ok = r["boundary_edges"] == 0 and r["nonmanifold_edges"] == 0
        bad += 0 if ok else 1
        print(
            f"{name:<16} {r['verts']:>7} {r['tris']:>7} "
            f"{r['boundary_edges']:>5} {r['nonmanifold_edges']:>6}  {'closed' if ok else 'OPEN'}"
        )
        write_stl(mesh, name, os.path.join(exports, f"{name}.stl"))

    glb = os.path.join(models, "axon-6.glb")
    write_glb(root, MATERIALS, glb)

    total_tris = sum(m.edge_report()["tris"] for m in parts.values())

    # The spec sheet in the app is generated from these same constants, so the
    # published numbers can never drift from the geometry that was exported.
    spec = {
        "name": "AXON-6",
        "axes": 6,
        "reach_mm": round(L1 + L2 + WRIST_H + YOKE_H + FLANGE_H, 1),
        "height_mm": round(J1_Z + SHOULDER_H + 26 + L1 + L2 + WRIST_H + YOKE_H, 1),
        "parts": len(parts),
        "triangles": total_tris,
        "glb_bytes": os.path.getsize(glb),
        "links": [
            {"name": "Plinth", "symbol": "PLINTH_H", "value_mm": PLINTH_H, "note": "granite pad the base bolts to"},
            {"name": "Pedestal", "symbol": "BASE_H", "value_mm": BASE_H, "note": "tapered column to the yaw axis"},
            {"name": "Shoulder", "symbol": "SHOULDER_H", "value_mm": SHOULDER_H, "note": "J1 to the pitch axis"},
            {"name": "Upper arm", "symbol": "L1", "value_mm": L1, "note": "J2 to J3"},
            {"name": "Forearm", "symbol": "L2", "value_mm": L2, "note": "J3 to J4"},
            {"name": "Wrist", "symbol": "WRIST_H", "value_mm": WRIST_H, "note": "J4 to J5"},
            {"name": "Yoke", "symbol": "YOKE_H", "value_mm": YOKE_H, "note": "J5 to J6"},
            {"name": "Tool flange", "symbol": "FLANGE_H", "value_mm": FLANGE_H, "note": "mounting face"},
        ],
        "joints": [
            {"id": "J1_yaw", "axis": "Z", "drives": "base rotation"},
            {"id": "J2_pitch", "axis": "Y", "drives": "shoulder"},
            {"id": "J3_pitch", "axis": "Y", "drives": "elbow"},
            {"id": "J4_roll", "axis": "Z", "drives": "forearm roll"},
            {"id": "J5_pitch", "axis": "Y", "drives": "wrist"},
            {"id": "J6_roll", "axis": "Z", "drives": "tool roll"},
        ],
        "gripper": {
            "type": "parallel jaw",
            "stroke_mm": GRIP_OPEN,
            "finger_length_mm": FINGER_L,
            "pad_thickness_mm": PAD_T,
        },
        "materials": [
            {"key": k, "metallic": v["metallic"], "roughness": v["roughness"],
             "color": "#%02X%02X%02X" % tuple(int(c * 255) for c in v["color"][:3])}
            for k, v in MATERIALS.items()
        ],
        "part_report": [
            {"part": n, "triangles": m.edge_report()["tris"], "closed": m.is_closed()}
            for n, m in parts.items()
        ],
    }
    spec_path = os.path.join(repo, "lib", "arm-spec.json")
    with open(spec_path, "w") as f:
        json.dump(spec, f, indent=2)
    print(f"spec -> {os.path.relpath(spec_path, repo)}")

    print("-" * 56)
    print(f"{len(parts)} parts, {total_tris} triangles, {bad} not closed")
    print(f"glb  -> {os.path.relpath(glb, repo)}  ({os.path.getsize(glb) / 1024:.0f} KB)")
    print(f"stl  -> {os.path.relpath(exports, repo)}/")
    if bad:
        raise SystemExit(f"{bad} part(s) failed the closed-surface check")


if __name__ == "__main__":
    main()
