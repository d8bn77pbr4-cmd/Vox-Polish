"""Writes test.json: a 10-second style test (stickman, visitor, motion, score)."""
import json
from pathlib import Path

lying = {"loc": [1.02, 1.7, 0.68], "yaw": 90, "torso": [-90, 0], "head": [0, 0], "leg_l": [90, 4, 0], "leg_r": [90, 4, 0],
         "arm_l": [0, 14, 5], "arm_r": [0, 14, 5], "face": "smile"}
sitting = {**lying, "torso": [-5, 0], "head": [-95, 12], "face": "flat"}
reading = {**lying, "torso": [8, 0], "head": [0, 32], "arm_r": [55, 10, 85], "arm_l": [20, 15, 30], "face": "flat"}
turned = {**reading, "head": [105, 5], "face": "terrified"}
corner = {"loc": [1.5, 0.22, 0], "rot": 180, "lean": 3}            # against the far wall, beyond the bed
behind = {"loc": [1.18, 0.95, 0], "rot": 180, "lean": 12}          # right at your bedside
lean_in = {"loc": [1.14, 0.95, 0], "rot": 180, "lean": 26}
turned = {**reading, "head": [-80, 5], "face": "terrified"}

import numpy as np


def R(axis, d):
    c, s_ = np.cos(np.radians(d)), np.sin(np.radians(d))
    return {"X": np.array([[1, 0, 0], [0, c, -s_], [0, s_, c]]), "Y": np.array([[c, 0, s_], [0, 1, 0], [-s_, 0, c]]),
            "Z": np.array([[c, -s_, 0], [s_, c, 0], [0, 0, 1]])}[axis]


def hand_and_head(p):
    """Same forward kinematics as apartment.pose_stickman (mannequin), for aiming cameras."""
    H = np.array(p["loc"])
    RT = R("Z", p["yaw"]) @ R("X", p["torso"][0]) @ R("Y", p["torso"][1])
    RH = RT @ R("Z", p["head"][0]) @ R("X", p["head"][1])
    center = H + RT @ [0, 0, 0.55] + RH @ [0, 0, 0.07 + 0.13 * 0.85]
    fwd, abd, bend = p["arm_r"]
    RA = RT @ R("X", -fwd) @ R("Y", abd)
    RF = RA @ R("X", -bend)
    wrist = H + RT @ [-0.19, 0, 0.55 * 0.86] + RA @ [0, 0, -0.3] + RF @ [0, 0, -0.27]
    return wrist + RF @ [0, 0, -0.05], center


def cam(loc, target, lens):
    return {"loc": [round(float(v), 3) for v in loc], "target": [round(float(v), 3) for v in target], "lens": lens}


wide_a, wide_b = cam([2.25, 3.15, 1.6], [0.95, 1.2, 0.8], 18), cam([1.95, 2.95, 1.45], [0.95, 1.2, 0.9], 18)
mid = lambda a, b, k: {kk: ([x + (y - x) * k for x, y in zip(a[kk], b[kk])] if isinstance(a[kk], list) else a[kk])
                       for kk in a}
hand, head = hand_and_head(reading)
phone = hand + (head - hand) / np.linalg.norm(head - hand) * 0.045 + np.array([0, 0, 0.06])
view = phone + (head - phone) / np.linalg.norm(head - phone) * 0.36 + np.array([0, -0.3, 0.12])
print("phone", phone.round(2), "head", head.round(2), "cam-head", round(float(np.linalg.norm(view - head)), 2))
ots_a, ots_b = cam(view, phone, 40), cam(view + (phone - view) * 0.15, phone, 40)
close_a, close_b = cam([1.75, 2.75, 1.45], [1.0, 1.2, 1.1], 22), cam([1.6, 2.6, 1.42], [1.0, 1.2, 1.1], 22)
screen = {"screen": "notif_bedroom"}

ep = {
    "id": "test", "part": 1, "battery": 23, "clock": "03:12:04", "cover_at": 3.0, "choice": None,
    "caption": "style test", "hashtags": [],
    "screens": {"notif_bedroom": {"time": "3:12", "battery": 23, "cards": [
        {"app": "HOMECAM", "when": "now", "title": "Person detected", "body": "Bedroom"}]}},
    "shots": {
        "cold": {"camera": cam([1.45, 2.8, 1.45], [1.1, 1.2, 1.5], 26),
                 "state": {"stick": turned, "visitor": lean_in, "glow": 3, **screen, "phone": "hand"}},
        "wide": {"state": {**screen, "visitor": corner},
                 "anim": {"seconds": 3.2, "keys": [
                     {"at": 0.0, "camera": wide_a, "state": {"stick": lying}},
                     {"at": 0.35, "camera": mid(wide_a, wide_b, 0.35), "state": {"stick": lying}},
                     {"at": 0.75, "camera": mid(wide_a, wide_b, 0.75), "state": {"stick": sitting}},
                     {"at": 1.0, "camera": wide_b, "state": {"stick": {**sitting, "head": [-100, 14]}}}]}},
        "ots": {"state": {**screen, "phone": "hand"}, "dof": 0.42,
                "anim": {"seconds": 2.2, "keys": [
                    {"at": 0.0, "camera": ots_a, "state": {"stick": reading}},
                    {"at": 1.0, "camera": ots_b, "state": {"stick": reading}}]}},
        "turn": {"state": {**screen, "phone": "hand"},
                 "anim": {"seconds": 2.4, "keys": [
                     {"at": 0.0, "camera": close_a, "state": {"stick": reading}},
                     {"at": 0.45, "camera": mid(close_a, close_b, 0.45), "state": {"stick": reading}},
                     {"at": 1.0, "camera": close_b, "state": {"stick": turned}}]}},
        "behind": {"camera": close_b, "state": {"stick": turned, "visitor": behind, **screen, "phone": "hand"}},
    },
    "beats": [  # short lines so the test stays near 10 s
        {"shot": "cold", "dur": 0.8, "move": "punch", "sfx": [["impact", 0.0, 0.8]], "music": "silence"},
        {"shot": "black", "card": "3 MINUTES EARLIER", "dur": 1.1, "sfx": [["whoosh", 0.1]], "music": "drone"},
        {"shot": "wide", "pre": 0.3, "sfx": [["buzz", 0.4, 1.0, -0.6], ["bed", 1.3, 0.8], ["cloth", 1.4]],
         "say": [["Three twelve A M.", "3:12 AM"]], "dur": 3.0},
        {"shot": "ots", "music": "pulse60", "say": ["Person detected. *Bedroom.*"], "dur": 2.2},
        {"shot": "turn", "music": "riser", "sfx": [["swell", 1.1, 0.9]], "say": ["You live *alone.*"], "dur": 2.4,
         "heart": 110},
        {"shot": "behind", "dur": 0.9, "scare": True, "music": "silence"},
        {"shot": "black", "dur": 0.6},
    ],
}
Path(__file__).with_name("test.json").write_text(json.dumps(ep, indent=1))
