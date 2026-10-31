"""Shared helpers for the episode generators: forward kinematics of the mannequin and camera keyframes."""
import numpy as np


def R(axis, d):
    c, s = np.cos(np.radians(d)), np.sin(np.radians(d))
    return {"X": np.array([[1, 0, 0], [0, c, -s], [0, s, c]]), "Y": np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]]),
            "Z": np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])}[axis]


def body(p):
    """Same forward kinematics as apartment.pose_stickman: right hand, head centre and where the face looks."""
    H = np.array(p["loc"])
    RT = R("Z", p["yaw"]) @ R("X", p["torso"][0]) @ R("Y", p["torso"][1])
    RH = RT @ R("Z", p["head"][0]) @ R("X", p["head"][1])
    head = H + RT @ [0, 0, 0.55] + RH @ [0, 0, 0.07 + 0.13 * 0.85]
    fwd, abd, bend = p["arm_r"]
    RA = RT @ R("X", -fwd) @ R("Y", abd)
    RF = RA @ R("X", -bend)
    wrist = H + RT @ [-0.19, 0, 0.55 * 0.86] + RA @ [0, 0, -0.3] + RF @ [0, 0, -0.27]
    return wrist + RF @ [0, 0, -0.05], head, RH @ [0, -1, 0]


def cam(loc, target, lens):
    return {"loc": [round(float(v), 3) for v in loc], "target": [round(float(v), 3) for v in target], "lens": lens}


def push(a, b, k):
    return {key: ([x + (y - x) * k for x, y in zip(a[key], b[key])] if isinstance(a[key], list) else a[key])
            for key in a}


def anim(seconds, frames):
    """frames: list of (at, camera, your pose, extra state)."""
    return {"seconds": seconds, "keys": [{"at": at, "camera": c, "state": {"stick": pose, **extra}}
                                         for at, c, pose, extra in frames]}


