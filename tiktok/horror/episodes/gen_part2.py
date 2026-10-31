"""Writes part2a.json (you held the door) and part2b.json (you hid in the wardrobe), same pacing as part 1."""
import json
from pathlib import Path

import numpy as np

from kit import anim, body, cam, push

COMMON = {"part": 2, "battery": 19, "clock": "03:14:31", "cover_at": 6.0,
          "hashtags": ["#horror", "#scary", "#pov", "#horrorstory", "#creepy", "#whatwouldyoudo", "#part2", "#fyp"]}
CHOICE = {"A": "Run for the front door", "B": "Call the police", "footer": "PART 3 FOLLOWS THE MAJORITY",
          "say": "Run for the front door… or call the police? Comment A or B."}


def ots(pose, back=0.36, side=(0, -0.3, 0.12)):
    """Over-the-shoulder camera on the phone in your right hand."""
    hand, head, _ = body(pose)
    phone = hand + (head - hand) / np.linalg.norm(head - hand) * 0.045 + np.array([0, 0, 0.06])
    view = phone + (head - phone) / np.linalg.norm(head - phone) * back + np.array(side)
    return cam(view, phone, 40), cam(view + (phone - view) * 0.12, phone, 40)


def face_cam(pose, dist=0.7, lens=32):
    _, head, look = body(pose)
    return cam(head + look * dist, head, lens), cam(head + look * dist * 0.8, head, lens)


# ================================================================ A: you hold the door
brace = {"loc": [2.85, 2.82, 0.95], "yaw": 180, "torso": [20, 0], "head": [0, -4], "arm_l": [72, 16, 30],
         "arm_r": [72, 16, 30], "leg_l": [-14, 4, 6], "leg_r": [22, 4, 28], "face": "terrified"}
shoved = {**brace, "torso": [10, 0], "head": [0, 6]}
still = {**brace, "torso": [14, 0], "face": "worried", "tremble": True}
reading = {"loc": [2.85, 2.75, 0.95], "yaw": 180, "torso": [6, 0], "head": [0, 30], "arm_r": [55, 10, 85],
           "arm_l": [20, 15, 30], "leg_l": [0, 3, 4], "leg_r": [0, 3, 4], "face": "worried"}
turning = {**reading, "yaw": 0, "head": [0, 4], "arm_r": [40, 10, 70], "face": "worried"}
facing = {**turning, "face": "terrified", "tremble": True}
walking_in = {"loc": [3.75, 3.95, 0.95], "yaw": -90, "torso": [4, 0], "head": [0, 2], "arm_l": [-15, 8, 15],
              "arm_r": [18, 8, 20], "leg_l": [20, 3, 10], "leg_r": [-18, 3, 30], "face": "smile"}

brace_a, brace_b = cam([1.25, 1.45, 1.55], [2.85, 3.3, 1.1], 22), cam([1.45, 1.65, 1.5], [2.85, 3.3, 1.15], 22)
side_a, side_b = cam([2.05, 3.05, 1.55], [2.85, 3.2, 1.35], 28), cam([2.15, 3.08, 1.55], [2.85, 3.2, 1.35], 28)
read_a, read_b = ots(reading)
turn_a, turn_b = cam([2.95, 1.25, 1.5], [2.85, 2.9, 1.35], 26), cam([2.93, 1.45, 1.5], [2.85, 2.9, 1.35], 26)
back_a, back_b = cam([2.62, 3.25, 1.68], [3.05, 0.5, 1.25], 24), cam([2.66, 3.1, 1.66], [3.05, 0.5, 1.28], 24)
fear_a, fear_b = face_cam(facing)
in_hand = {"screen": "notif_motion", "phone": "hand"}

a = {**COMMON, "id": "part2a",
     "caption": "Part 2 (you chose A): you held the door. It has been inside since midnight. Comment A or B for part 3.",
     "screens": {"notif_motion": {"time": "3:14", "battery": 19, "cards": [
         {"app": "HOMECAM", "when": "now", "title": "Motion ended", "body": "Hallway"},
         {"app": "HOMECAM", "when": "2m ago", "title": "Person detected", "body": "Hallway"}]}},
     "shots": {
         "brace": {"state": in_hand, "anim": anim(4.4, [
             (0.0, brace_a, brace, {}), (0.5, push(brace_a, brace_b, 0.5), brace, {}), (1.0, brace_b, brace, {})])},
         "push": {"state": in_hand, "anim": anim(5.0, [
             (0.0, side_a, brace, {}), (0.22, push(side_a, side_b, 0.22), shoved, {}),
             (0.32, push(side_a, side_b, 0.32), brace, {}), (0.48, push(side_a, side_b, 0.48), shoved, {}),
             (0.6, push(side_a, side_b, 0.6), brace, {}), (1.0, side_b, brace, {})])},
         "stops": {"state": in_hand, "anim": anim(3.6, [(0.0, side_b, brace, {}), (1.0, side_b, still, {})])},
         "read": {"state": in_hand, "dof": 0.42, "anim": anim(3.0, [(0.0, read_a, reading, {}),
                                                                    (1.0, read_b, reading, {})])},
         "cctv_ir": {"cam": "cctv", "state": {"ir": True}, "grade": "ir", "label": "HALLWAY"},
         "clip_home": {"cam": "cctv", "state": {"hall_light": True, "stick": walking_in, "visitor": "front_behind"},
                       "grade": "cctv", "label": "HALLWAY", "clip": "11:58:12 PM"},
         "clip_wait": {"cam": "cctv", "state": {"ir": True, "visitor": "hall_door"}, "grade": "ir",
                       "label": "HALLWAY", "clip": "12:31:40 AM"},
         "turn": {"state": in_hand, "anim": anim(4.4, [
             (0.0, turn_a, {**reading, "head": [0, 4]}, {}), (0.25, push(turn_a, turn_b, 0.25), {**reading, "head": [0, 4]}, {}),
             (0.85, push(turn_a, turn_b, 0.85), turning, {}), (1.0, turn_b, turning, {})])},
         "creak": {"state": in_hand, "anim": anim(4.2, [
             (0.0, back_a, turning, {"wardrobe": 0}), (0.3, push(back_a, back_b, 0.3), turning, {"wardrobe": 0}),
             (0.75, push(back_a, back_b, 0.75), facing, {"wardrobe": 14}), (1.0, back_b, facing, {"wardrobe": 15})])},
         "fear": {"state": {**in_hand, "wardrobe": 15}, "anim": anim(4.4, [(0.0, fear_a, facing, {}),
                                                                          (1.0, fear_b, facing, {})])},
         "terror": {"state": {**in_hand, "wardrobe": 15}, "anim": anim(1.2, [(0.0, fear_b, facing, {}),
                                                                            (1.0, fear_b, facing, {})])},
         "face": {"cam": "wardrobe_close", "state": {"wardrobe": 15, "visitor": "in_wardrobe", "glow": 6}},
     },
     "beats": [
         {"shot": "brace", "pre": 0.4, "sfx": [["slam", 0.15, 1.2]], "title": ["PART 2", "YOU CHOSE: HOLD THE DOOR"],
          "music": "pulse90", "heart": 100, "say": ["You slam the door *shut.*"], "post": 0.8},
         {"shot": "push", "pre": 0.3, "sfx": [["thud", 1.1], ["thud", 2.4, 0.8]], "heart": 104,
          "say": ["You push with all your weight.", "Something pushes *back.*"], "post": 0.4},
         {"shot": "stops", "pre": 0.6, "music": "drone", "say": ["Then… it *stops.*"], "post": 1.2},
         {"shot": "read", "sfx": [["buzz", 0.0, 0.9]], "say": ["Your phone buzzes.", "Motion ended. Hallway."],
          "post": 0.5},
         {"shot": "cctv_ir", "say": ["The hallway is empty again.", "It's gone. *Right?*"], "post": 0.8},
         {"shot": "clip_home", "music": "pulse60", "say": ["You scroll back through the clips.",
                                                           ["Eleven fifty-eight P M.", "11:58 PM"], "That's you. Coming *home.*"],
          "post": 0.5},
         {"shot": "clip_home", "move": "push", "heart": 80, "say": ["And right behind you…", "something walks *in.*"],
          "post": 0.8},
         {"shot": "clip_wait", "say": [["Twelve thirty-one.", "12:31 AM"], "It's standing outside your door.",
                                       "Not moving."], "post": 0.5},
         {"shot": "clip_wait", "move": "push", "say": ["For almost *three hours.*"], "post": 1.0},
         {"shot": "turn", "music": "pulse90", "pre": 0.8, "sfx": [["step", 1.2, 0.6], ["step", 1.8, 0.6]],
          "say": ["Where is it *now?*"], "post": 0.9},
         {"shot": "creak", "pre": 0.9, "sfx": [["creak_low", 1.2, 1.0, -0.4]], "say": ["Behind you…",
                                                                                     "the wardrobe *creaks.*"],
          "post": 0.5},
         {"shot": "fear", "music": "riser", "pre": 0.6, "pan": -0.4, "whisper": ["Sweetie…", "I'm right here."],
          "heart": 110, "post": 0.5},
         {"shot": "terror", "dur": 1.1, "silence": True, "music": "silence"},
         {"shot": "face", "dur": 0.85, "scare": True},
         {"shot": "black", "dur": 0.5},
     ],
     "choice": CHOICE}

# ================================================================ B: you hide in the wardrobe
hiding = {"loc": [3.1, 0.3, 0.95], "yaw": 180, "torso": [4, 0], "head": [0, 6], "arm_l": [15, 6, 40],
          "arm_r": [15, 6, 40], "leg_l": [0, 3, 6], "leg_r": [0, 3, 6], "face": "worried"}
holding = {**hiding, "head": [0, 30], "arm_r": [55, 8, 90], "arm_l": [25, 10, 45]}
pressing = {**holding, "head": [0, 10], "arm_r": [35, 4, 140], "face": "terrified", "tremble": True}
frozen = {**hiding, "face": "terrified", "tremble": True}

close_a, close_b = cam([2.1, 2.3, 1.5], [3.05, 0.4, 1.25], 22), cam([2.25, 2.0, 1.48], [3.05, 0.4, 1.25], 22)
_, h_hide, _ = body(hiding)
inside_a = cam(h_hide + [0, 0.24, -0.02], h_hide, 18)
inside_b = cam(h_hide + [0, 0.21, -0.02], h_hide, 18)
hold_a, hold_b = ots(holding, back=0.3, side=(-0.12, 0.0, 0.1))
phone_b = {"screen": "notif_door", "phone": "hand"}

b = {**COMMON, "id": "part2b",
     "caption": "Part 2 (you chose B): you hid in the wardrobe. Bad idea? Comment A or B for part 3.",
     "screens": {"notif_door": {"time": "3:14", "battery": 19, "cards": [
         {"app": "HOMECAM", "when": "now", "title": "Person detected", "body": "Bedroom door"},
         {"app": "HOMECAM", "when": "2m ago", "title": "Person detected", "body": "Hallway"}]}},
     "shots": {
         "close_in": {"anim": anim(4.6, [
             (0.0, close_a, hiding, {"wardrobe": 45}), (0.25, push(close_a, close_b, 0.25), hiding, {"wardrobe": 45}),
             (0.9, push(close_a, close_b, 0.9), hiding, {"wardrobe": 3}), (1.0, close_b, hiding, {"wardrobe": 2})])},
         "breath": {"anim": anim(4.0, [(0.0, inside_a, hiding, {}), (1.0, inside_b, hiding, {})])},
         "slit_door": {"cam": "wardrobe_slit", "state": {}, "gain": 1.3,
                       "anim": {"param": "door", "from": 0, "to": 70, "frames": 40}},
         "slit_open": {"cam": "wardrobe_slit", "state": {"door": 70}, "gain": 1.3},
         "waiting": {"anim": anim(4.0, [(0.0, inside_a, {**hiding, "door": 70}, {"door": 70}),
                                        (1.0, inside_b, frozen, {"door": 70})])},
         "buzz": {"state": phone_b, "dof": 0.36, "anim": anim(3.4, [
             (0.0, hold_a, holding, {"door": 70}), (1.0, hold_b, holding, {"door": 70})])},
         "press": {"state": phone_b, "anim": anim(3.6, [
             (0.0, inside_a, holding, {"door": 70}), (0.4, push(inside_a, inside_b, 0.4), pressing, {"door": 70}),
             (1.0, inside_b, pressing, {"door": 70})])},
         "clip_enter": {"cam": "cctv", "state": {"ir": True, "visitor": "entering", "door": 70}, "grade": "ir",
                        "label": "HALLWAY", "clip": "3:14:21 AM"},
         "empty": {"anim": anim(4.0, [(0.0, inside_a, frozen, {"door": 70}), (1.0, inside_b, frozen, {"door": 70})])},
         "slit_dark": {"cam": "wardrobe_slit", "state": {"door": 70, "visitor": "front_of_wardrobe", "glow": 0.6},
                       "gain": 1.2},
         "found": {"state": phone_b, "anim": anim(3.6, [(0.0, inside_a, pressing, {"door": 70, "visitor": "front_of_wardrobe"}),
                                                       (1.0, inside_b, pressing, {"door": 70, "visitor": "front_of_wardrobe"})])},
         "terror": {"state": phone_b, "anim": anim(1.2, [(0.0, inside_b, pressing, {"door": 70, "visitor": "front_of_wardrobe"}),
                                                        (1.0, inside_b, pressing, {"door": 70, "visitor": "front_of_wardrobe"})])},
         "eye": {"cam": "wardrobe_slit", "state": {"door": 70, "visitor": "eye_slit", "glow": 4}},
     },
     "beats": [
         {"shot": "close_in", "pre": 0.4, "sfx": [["creak", 3.6, 0.5]], "title": ["PART 2", "YOU CHOSE: HIDE"],
          "music": "drone", "say": ["You slip into the wardrobe."], "post": 1.4},
         {"shot": "breath", "pre": 0.5, "sfx": [["breath", 0.4, 0.9]], "say": ["You hold your *breath.*"], "post": 1.2},
         {"shot": "slit_door", "pre": 0.5, "anim_dur": 3.4, "sfx": [["creak_low", 0.4]], "heart": 84,
          "say": ["Your bedroom door…", "*opens.*"], "post": 1.0},
         {"shot": "slit_open", "move": "push", "say": ["Nobody comes *in.*"], "post": 0.6},
         {"shot": "slit_open", "say": ["The hallway is dark.", "Silent."], "post": 0.6},
         {"shot": "waiting", "music": "pulse60", "heart": 72, "say": ["You wait.", "One minute.", "Two."], "post": 0.8},
         {"shot": "buzz", "sfx": [["buzz", 0.0, 1.5]], "say": ["Then your phone buzzes.", "*Loud.*"], "post": 0.4},
         {"shot": "press", "say": ["You press it against your chest.", "Person detected.", "*Bedroom door.*"],
          "post": 0.5},
         {"shot": "clip_enter", "music": "pulse90", "say": ["You open the clip.", "Ten seconds ago."], "post": 0.4},
         {"shot": "clip_enter", "move": "push", "heart": 96, "say": ["Something tall…", "walks into your *room.*"]},
         {"shot": "clip_enter", "move": "push", "say": ["And it never walks back *out.*"], "post": 0.6},
         {"shot": "empty", "say": ["But your room is empty.", "Isn't it?"], "post": 1.0},
         {"shot": "slit_dark", "sfx": [["breath", 0.0, 1.0]], "say": ["Then the gap goes *dark.*"], "post": 0.6},
         {"shot": "found", "music": "riser", "whisper": ["Found you, sweetie."], "heart": 112, "post": 0.4},
         {"shot": "terror", "dur": 1.1, "silence": True, "music": "silence"},
         {"shot": "eye", "dur": 0.85, "scare": True},
         {"shot": "black", "dur": 0.5},
     ],
     "choice": CHOICE}

here = Path(__file__).parent
for ep in (a, b):
    (here / f"{ep['id']}.json").write_text(json.dumps(ep, indent=1))
