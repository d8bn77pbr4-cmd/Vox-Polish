"""Writes part1.json: PERSON DETECTED, part 1, with you as the mannequin (third-person camera, narrator says "you").

Pacing follows the first version: one new piece of information per beat, 3-5 s shots with slow camera moves,
breathing room between lines, and the threat only at the very end."""
import json
from pathlib import Path

import numpy as np

# ---------------------------------------------------------------- your poses
lying = {"loc": [1.02, 1.7, 0.68], "yaw": 90, "torso": [-90, 0], "head": [0, 0], "leg_l": [90, 4, 0],
         "leg_r": [90, 4, 0], "arm_l": [0, 14, 5], "arm_r": [0, 14, 5], "face": "sleep"}
waking = {**lying, "head": [-45, 0], "face": "worried"}
sitting = {**lying, "torso": [-4, 0], "head": [40, 8], "arm_r": [35, 10, 60], "arm_l": [10, 14, 20], "face": "worried"}
reading = {**sitting, "torso": [8, 0], "head": [0, 32], "arm_r": [55, 10, 85], "arm_l": [20, 15, 30]}
listening = {**sitting, "head": [44, 4], "arm_r": [45, 10, 80], "tremble": True}
cower = {**listening, "loc": [0.86, 1.7, 0.68], "torso": [-16, 0], "leg_l": [108, 4, 80], "leg_r": [104, 4, 75],
         "arm_l": [60, 22, 110], "arm_r": [55, 10, 90], "head": [46, 2], "face": "terrified"}


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


# ---------------------------------------------------------------- cameras
wide_a, wide_b = cam([2.15, 3.1, 1.65], [0.75, 1.55, 0.65], 20), cam([1.95, 2.95, 1.52], [0.75, 1.55, 0.7], 20)
sit_a, sit_b = cam([2.35, 2.85, 1.3], [0.95, 1.7, 1.0], 22), cam([2.22, 2.74, 1.28], [0.95, 1.7, 1.02], 22)
hand, head, _ = body(reading)
phone = hand + (head - hand) / np.linalg.norm(head - hand) * 0.045 + np.array([0, 0, 0.06])
view = phone + (head - phone) / np.linalg.norm(head - phone) * 0.36 + np.array([0, -0.3, 0.12])
ots_a, ots_b = cam(view, phone, 40), cam(view + (phone - view) * 0.12, phone, 40)
door_a, door_b = cam([0.7, 1.2, 1.62], [2.85, 3.42, 0.55], 22), cam([0.82, 1.32, 1.58], [2.85, 3.42, 0.55], 22)
_, h_listen, look = body(listening)
face_a = cam(h_listen + look * 0.8 + [0, 0, 0.02], h_listen, 32)
face_b = cam(h_listen + look * 0.62 + [0, 0, 0.01], h_listen, 32)
cower_a, cower_b = cam([2.2, 3.0, 1.5], [0.85, 1.7, 0.9], 22), cam([2.02, 2.84, 1.44], [0.85, 1.7, 0.95], 22)
_, h_cower, look_c = body(cower)
scared = cam(h_cower + look_c * 0.48, h_cower, 35)

nightstand = {"screen": "notif_hallway"}
in_hand = {"screen": "notif_hallway", "phone": "hand"}

ep = {
    "id": "part1", "part": 1, "battery": 23, "clock": "03:12:04", "cover_at": 9.0,
    "caption": "You live alone. So who is in your hallway? 👀 Part 1 — comment A or B, part 2 follows the majority.",
    "hashtags": ["#horror", "#scary", "#pov", "#horrorstory", "#creepy", "#whatwouldyoudo", "#3am", "#fyp"],
    "screens": {
        "notif_hallway": {"time": "3:12", "battery": 23, "cards": [
            {"app": "HOMECAM", "when": "now", "title": "Person detected", "body": "Hallway"}]},
        "msg_mom": {"time": "3:13", "battery": 23, "cards": [
            {"app": "HOMECAM", "when": "1m ago", "title": "Person detected", "body": "Hallway"},
            {"app": "MESSAGES", "when": "11:04 PM", "title": "Mom", "body": "Landed in Lisbon! ♥ Love you, call you tomorrow"}]},
    },
    "shots": {
        "sleep": {"state": nightstand, "anim": anim(5.0, [
            (0.0, wide_a, lying, {}), (0.45, push(wide_a, wide_b, 0.45), lying, {}),
            (0.8, push(wide_a, wide_b, 0.8), waking, {}), (1.0, wide_b, waking, {})])},
        "phone": {"cam": "phone_nightstand", "state": nightstand, "dof": 0.36},
        "sit_up": {"state": nightstand, "anim": anim(4.6, [
            (0.0, sit_a, waking, {}), (0.2, push(sit_a, sit_b, 0.2), waking, {}),
            (0.75, push(sit_a, sit_b, 0.75), sitting, {}), (1.0, sit_b, {**sitting, "head": [44, 8]}, {})])},
        "check": {"state": in_hand, "dof": 0.42, "anim": anim(2.6, [
            (0.0, ots_a, reading, {}), (1.0, ots_b, reading, {})])},
        "cctv": {"cam": "cctv", "state": {"hall_light": True}, "grade": "cctv", "label": "HALLWAY"},
        "toward_door": {"state": {**in_hand, "hall_light": True}, "anim": anim(4.4, [
            (0.0, door_a, {**sitting, "head": [30, 10]}, {}), (0.18, push(door_a, door_b, 0.18), {**sitting, "head": [30, 10]}, {}),
            (0.3, push(door_a, door_b, 0.3), listening, {}), (1.0, door_b, listening, {})])},
        "feet": {"cam": "door_bottom", "state": {"hall_light": True, "feet": True}},
        "dark_floor": {"cam": "door_bottom", "state": {}, "gain": 1.6},
        "frozen": {"state": in_hand, "anim": anim(4.6, [
            (0.0, face_a, listening, {}), (1.0, face_b, listening, {})])},
        "phone_mom": {"state": {"screen": "msg_mom", "phone": "hand"}, "dof": 0.42, "anim": anim(1.0, [
            (0.0, ots_a, reading, {}), (1.0, ots_b, reading, {})])},
        "cower": {"state": in_hand, "anim": anim(4.8, [
            (0.0, cower_a, listening, {}), (0.7, push(cower_a, cower_b, 0.7), cower, {}),
            (1.0, cower_b, cower, {})])},
        "handle": {"cam": "handle_close", "state": {"glow": 1.0},
                   "anim": {"param": "handle", "from": 0, "to": -45, "frames": 40}},
        "terror": {"state": in_hand, "anim": anim(1.2, [(0.0, scared, cower, {}), (1.0, scared, cower, {})])},
        "face": {"cam": "door_gap", "state": {"door": 18, "visitor": "door_gap", "glow": 6}},
    },
    "beats": [
        {"shot": "sleep", "fade_in": 0.5, "pre": 0.6, "sfx": [["buzz", 0.6, 0.9, -0.5]], "music": "drone",
         "say": [["Three twelve A M.", "3:12 AM"], "Your phone wakes you up."], "post": 0.6},
        {"shot": "phone", "pre": 0.3, "say": ["Person detected. *Hallway.*"], "post": 0.6},
        {"shot": "sit_up", "pre": 1.4, "sfx": [["bed", 0.4, 0.8], ["cloth", 0.6]], "say": ["You live *alone.*"],
         "post": 1.0},
        {"shot": "check", "sfx": [["click", 0.3, 0.6]], "say": ["You open the camera."], "post": 0.3},
        {"shot": "cctv", "say": ["The hallway is *empty.*"], "post": 0.4},
        {"shot": "cctv", "move": "push", "say": ["But the light is *on.*", "You turned it off.", "You're sure."],
         "post": 0.6},
        {"shot": "toward_door", "music": "pulse60", "pre": 0.6, "sfx": [["creak", 0.5]],
         "say": ["Then the floor *creaks.*", "Right outside your door."], "post": 0.6},
        {"shot": "feet", "move": "push", "pre": 0.5, "heart": 70, "say": ["Under your door…", "two *shadows.*",
                                                                         "Like *feet.*"], "post": 0.6},
        {"shot": "cctv", "heart": 76, "say": ["But the camera…", "still shows *nobody.*"], "post": 0.5},
        {"shot": "feet", "say": ["Then the light goes *out.*"], "switch": [{"at": 1.2, "shot": "dark_floor"}],
         "sfx": [["light_off", 1.2]], "post": 0.9},
        {"shot": "frozen", "music": "pulse90", "pre": 0.9, "sfx": [["breath", 0.2, 0.8, 0.6]], "pan": 0.6,
         "whisper": ["Sweetie? Are you awake?"], "post": 0.7},
        {"shot": "phone_mom", "move": "push", "say": ["That's your mom's voice.", "But Mom is in *Lisbon.*"],
         "post": 0.5},
        {"shot": "cower", "pre": 0.5, "pan": 0.6, "whisper": ["Open the door, sweetie.", "It's cold out here."],
         "sfx": [["cloth", 0.3], ["bed", 0.5, 0.6]], "heart": 92, "post": 0.4},
        {"shot": "handle", "music": "riser", "pre": 0.4, "anim_dur": 4.4, "sfx": [["squeak", 0.5, 1.0, 0.6]],
         "say": ["The handle…", "slowly…", "goes *down.*"], "heart": 104, "post": 0.4},
        {"shot": "terror", "dur": 1.1, "silence": True, "music": "silence"},
        {"shot": "face", "dur": 0.85, "scare": True},
        {"shot": "black", "dur": 0.5},
    ],
    "choice": {"A": "Hold the door shut", "B": "Hide in the wardrobe", "footer": "PART 2 FOLLOWS THE MAJORITY",
               "say": "Hold the door shut… or hide in the wardrobe? Comment A or B."},
}
Path(__file__).with_name("part1.json").write_text(json.dumps(ep, indent=1))
