"""Blender scene for "PERSON DETECTED": a small apartment at night (bedroom + hallway).

Run inside Blender; renders every job in a JSON list whose output file does not exist yet:

    blender -b --factory-startup -P tiktok/horror/apartment.py -- jobs.json

A job is {"out": "x.png", "shot": "bed_pov", "state": {...}, "samples": 32, "res": [1080, 1920]}.
Shots are the camera positions below, state switches lights, doors and figures (see DEFAULT)."""

import json
import math
import os
import sys

import bpy
from mathutils import Matrix, Quaternion, Vector

DEFAULT = {
    "hall_light": False,   # hallway ceiling lamp (also the light under the bedroom door)
    "feet": False,         # two shadows interrupt the light under the door
    "door": 0.0,           # bedroom door opening angle in degrees (opens into the bedroom)
    "handle": 0.0,         # door handle, negative = pressed down
    "wardrobe": 0.0,       # right wardrobe door opening angle
    "front_door": 0.0,     # apartment door opening angle
    "visitor": None,       # where the tall figure is (see VISITOR_POSES)
    "you": False,          # you, coming home through the front door
    "ir": False,           # infrared light of the hallway camera
    "screen": None,        # image on the phone screen
    "phone": "nightstand", # nightstand | door | wardrobe
    "glow": 0.0,           # cold phone light near the camera (lights faces from below)
    "exposure": 0.0,
    "stick": None,         # your stickman pose (see pose_stickman), None = not in the shot
    "tilt": 38.0,          # how far the visitor's head leans to the side
}


# ---------------------------------------------------------------- helpers

def material(name, color, rough=0.6, metal=0.0, emit=None, strength=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit:
        b.inputs["Emission Color"].default_value = (*emit, 1)
        b.inputs["Emission Strength"].default_value = strength
    return m


def box(name, x0, x1, y0, y1, z0, z1, mat, bevel=0.0, parent=None):
    bpy.ops.mesh.primitive_cube_add(location=((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2))
    o = bpy.context.object
    o.name = name
    o.scale = ((x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2)
    bpy.ops.object.transform_apply(scale=True)
    o.data.materials.append(mat)
    if bevel:
        mod = o.modifiers.new("bevel", "BEVEL")
        mod.width, mod.segments = bevel, 3
        bpy.ops.object.shade_smooth()
    if parent:
        attach(o, parent)
    return o


def cylinder(name, loc, r, depth, mat, rot=(0, 0, 0), parent=None, verts=32):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, location=loc, rotation=rot, vertices=verts)
    o = bpy.context.object
    o.name = name
    o.data.materials.append(mat)
    bpy.ops.object.shade_smooth()
    if parent:
        attach(o, parent)
    return o


def empty(name, loc, parent=None):
    o = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(o)
    o.location = loc
    if parent:
        attach(o, parent)
    return o


def attach(child, parent):
    bpy.context.view_layer.update()
    child.parent = parent
    child.matrix_parent_inverse = parent.matrix_world.inverted()


def area_light(name, loc, target, energy, size, color, size_y=None):
    data = bpy.data.lights.new(name, "AREA")
    data.energy, data.color = energy, color
    if size_y is None:
        data.size = size
    else:
        data.shape, data.size, data.size_y = "RECTANGLE", size, size_y
    o = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(o)
    o.location = loc
    o.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    return o


def point_light(name, loc, energy, color, radius=0.1):
    data = bpy.data.lights.new(name, "POINT")
    data.energy, data.color, data.shadow_soft_size = energy, color, radius
    o = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(o)
    o.location = loc
    return o


def look(cam, loc, target, lens, roll=0.0):
    cam.location = loc
    cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    cam.rotation_euler.rotate_axis("Z", math.radians(roll))
    cam.data.lens = lens


def show(objs, visible):
    for o in objs:
        o.hide_render = not visible
        o.hide_viewport = not visible


# ---------------------------------------------------------------- figures (skin-modifier skeletons)

def skin_figure(name, joints, bones, mat, subdiv=2):
    """A smooth body grown around a skeleton: joints = {key: ((x, y, z), (radius_x, radius_y))}."""
    keys = list(joints)
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([joints[k][0] for k in keys], [(keys.index(a), keys.index(b)) for a, b in bones], [])
    o = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(o)
    skin = o.modifiers.new("skin", "SKIN")
    skin.use_smooth_shade = True
    for i, k in enumerate(keys):
        sv = mesh.skin_vertices[0].data[i]
        sv.radius = joints[k][1]
        sv.use_root = i == 0
    sub = o.modifiers.new("subsurf", "SUBSURF")
    sub.levels = sub.render_levels = subdiv
    mesh.materials.append(mat)
    return o


def mirrored(joints):
    """Add the right side (x > 0) for every joint whose key starts with 'l_'."""
    out = dict(joints)
    for k, ((x, y, z), r) in joints.items():
        if k.startswith("l_"):
            out["r_" + k[2:]] = ((-x, y, z), r)
    return out


def limbs(*chains):
    bones = []
    for chain in chains:
        for side in ("l_", "r_"):
            names = [n if n in ("chest", "pelvis") else side + n for n in chain]
            bones += list(zip(names, names[1:]))
    return bones


def sphere(name, loc, radius, scale, mat, parent=None, segments=32):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=radius, location=loc, segments=segments, ring_count=segments // 2)
    o = bpy.context.object
    o.name, o.scale = name, scale
    o.data.materials.append(mat)
    bpy.ops.object.shade_smooth()
    if parent:
        attach(o, parent)
    return o


def visitor(mats):
    """The tall, thin figure: dark body, pale face with empty black eyes, arms down to the knees."""
    root = empty("visitor", (0, 0, 0))
    joints = mirrored({
        "pelvis": ((0, 0, 1.0), (0.12, 0.085)),
        "spine": ((0, 0.01, 1.22), (0.11, 0.075)),
        "chest": ((0, 0, 1.43), (0.15, 0.085)),
        "neck": ((0, -0.01, 1.62), (0.05, 0.05)),
        "neck_top": ((0, -0.03, 1.72), (0.042, 0.042)),
        "l_shoulder": ((-0.2, 0, 1.55), (0.055, 0.055)),
        "l_elbow": ((-0.25, 0.09, 1.10), (0.036, 0.036)),
        "l_wrist": ((-0.27, -0.02, 0.56), (0.026, 0.02)),
        "l_finger": ((-0.28, -0.07, 0.30), (0.012, 0.009)),
        "l_hip": ((-0.1, 0, 0.94), (0.075, 0.075)),
        "l_knee": ((-0.11, 0.0, 0.5), (0.055, 0.055)),
        "l_ankle": ((-0.11, 0.02, 0.08), (0.038, 0.038)),
        "l_toe": ((-0.11, -0.15, 0.03), (0.035, 0.02)),
    })
    bones = [("pelvis", "spine"), ("spine", "chest"), ("chest", "neck"), ("neck", "neck_top")]
    bones += limbs(("chest", "shoulder", "elbow", "wrist", "finger"), ("pelvis", "hip", "knee", "ankle", "toe"))
    body = skin_figure("vis_body", joints, bones, mats["vis_body"])
    attach(body, root)
    neck = empty("vis_neck", (0, -0.03, 1.72), parent=root)      # the head tilts at an impossible angle
    head = sphere("vis_head", (0, -0.03, 1.86), 0.11, (0.8, 0.95, 1.3), mats["vis_skin"], parent=neck)
    parts = [body, head]
    for x, z, r in ((-0.038, 1.89, 0.021), (0.04, 1.885, 0.02)):        # sunken eyes, slightly uneven
        parts.append(sphere("vis_eye", (x, -0.118, z), r, (1.35, 1, 0.8), mats["void"], parent=neck, segments=16))
    parts.append(sphere("vis_mouth", (0.003, -0.122, 1.74), 0.03, (0.5, 0.45, 2.2), mats["void"], parent=neck,
                        segments=16))                                    # a mouth that is too long
    return root, parts


def visitor_hand(mats):
    """A pale hand with four long fingers that curl around an edge (fingers point along +x)."""
    root = empty("vis_hand", (0, 0, 0))
    joints, bones = {"palm": ((-0.05, 0, 0), (0.035, 0.012))}, []
    for i, z in enumerate((0.03, 0.01, -0.01, -0.03)):
        length = 0.12 - abs(i - 1.5) * 0.012
        joints[f"b{i}"] = ((0.0, 0, z), (0.011, 0.009))
        joints[f"m{i}"] = ((length, 0.0, z * 1.2), (0.009, 0.008))
        joints[f"t{i}"] = ((length + 0.012, 0.045, z * 1.25), (0.007, 0.006))
        bones += [("palm", f"b{i}"), (f"b{i}", f"m{i}"), (f"m{i}", f"t{i}")]
    attach(skin_figure("vis_hand_mesh", joints, bones, mats["vis_skin"]), root)
    return root


def person(mats):
    """You: an ordinary person in a hoodie (only ever seen on the grainy camera)."""
    root = empty("you", (0, 0, 0))
    joints = mirrored({
        "pelvis": ((0, 0, 0.95), (0.16, 0.11)),
        "chest": ((0, 0, 1.3), (0.2, 0.12)),
        "neck": ((0, 0, 1.48), (0.07, 0.07)),
        "l_shoulder": ((-0.21, 0, 1.42), (0.08, 0.08)),
        "l_elbow": ((-0.26, 0.04, 1.12), (0.06, 0.06)),
        "l_wrist": ((-0.27, -0.02, 0.86), (0.045, 0.04)),
        "l_hip": ((-0.1, 0, 0.9), (0.09, 0.09)),
        "l_knee": ((-0.11, -0.03, 0.5), (0.07, 0.07)),
        "l_ankle": ((-0.11, 0.02, 0.08), (0.05, 0.05)),
        "l_toe": ((-0.11, -0.13, 0.04), (0.045, 0.03)),
    })
    bones = [("pelvis", "chest"), ("chest", "neck")]
    bones += limbs(("chest", "shoulder", "elbow", "wrist"), ("pelvis", "hip", "knee", "ankle", "toe"))
    attach(skin_figure("you_body", joints, bones, mats["you"]), root)
    sphere("you_hood", (0, 0.01, 1.62), 0.12, (1.0, 1.08, 1.15), mats["you"], parent=root)
    return root


# ---------------------------------------------------------------- you: a white stickman

BODY = {"torso": 0.55, "neck": 0.07, "upper": 0.3, "fore": 0.27, "thigh": 0.43, "shin": 0.42, "shoulder": 0.19,
        "hip": 0.09, "head": (0.105, 0.11, 0.13)}
SEGMENTS = {  # name: (radius x, radius y) of the ellipsoid that fills the bone
    "neck": (0.045, 0.045), "l_upper": (0.05, 0.05), "r_upper": (0.05, 0.05), "l_fore": (0.042, 0.042),
    "r_fore": (0.042, 0.042), "l_thigh": (0.075, 0.075), "r_thigh": (0.075, 0.075), "l_shin": (0.055, 0.055),
    "r_shin": (0.055, 0.055), "l_hand": (0.05, 0.026), "r_hand": (0.05, 0.026),
}
TRUNK = {"chest": ((0, 0, 0.38), (0.155, 0.095, 0.2)), "belly": ((0, 0, 0.19), (0.12, 0.08, 0.12)),
         "pelvis": ((0, 0, 0.02), (0.155, 0.1, 0.1))}
JOINTS = ("l_shoulder", "r_shoulder", "l_elbow", "r_elbow", "l_knee", "r_knee")


def stickman(mats):
    """You: a white art-class mannequin with a cartoon face (eyes with pupils, brows, mouth)."""
    parts = {}
    for name in (*SEGMENTS, *TRUNK, *JOINTS, "l_foot", "r_foot"):
        parts[name] = sphere("you_" + name, (0, 0, 0), 1.0, (1, 1, 1), mats["chalk"])
    head = empty("you_head", (0, 0, 0))
    rx, ry, rz = BODY["head"]
    ball = sphere("you_skull", (0, 0, 0), 1.0, (rx, ry, rz), mats["chalk"], parent=head)
    surf = lambda x, z: -ry * math.sqrt(max(0.0, 1 - (x / rx) ** 2 - (z / rz) ** 2))
    eyes, pupils, brows = [], [], []
    for x in (-0.038, 0.038):
        rim = sphere("you_eye_rim", (x, surf(x, 0.02) + 0.001, 0.02), 0.031, (1, 0.3, 1.25), mats["ink"], parent=head,
                     segments=24)
        e = sphere("you_eye", (x, surf(x, 0.02) - 0.002, 0.02), 0.026, (1, 0.3, 1.25), mats["eye"], parent=head,
                   segments=24)
        eyes += [e, rim]
        pupils.append(sphere("you_pupil", (x * 0.92, surf(x, 0.017) - 0.012, 0.017), 0.011, (1, 0.4, 1.1), mats["ink"],
                             parent=head, segments=16))
        bpy.ops.mesh.primitive_cylinder_add(radius=0.0045, depth=0.036, vertices=12, rotation=(0, math.pi / 2, 0),
                                            location=(x, surf(x, 0.07) + 0.002, 0.07))
        b = bpy.context.object
        b.data.materials.append(mats["ink"])
        attach(b, head)
        brows.append(b)
    mouths = {}
    for kind, pts in (("smile", [(-0.03, -0.045), (0.0, -0.058), (0.03, -0.045)]),
                      ("flat", [(-0.025, -0.055), (-0.008, -0.05), (0.008, -0.058), (0.025, -0.053)])):
        curve = bpy.data.curves.new("mouth_" + kind, "CURVE")
        curve.dimensions, curve.bevel_depth = "3D", 0.0045
        spl = curve.splines.new("BEZIER")
        spl.bezier_points.add(len(pts) - 1)
        for bp, (x, z) in zip(spl.bezier_points, pts):
            bp.co = (x, surf(x, z) - 0.002, z)
            bp.handle_left_type = bp.handle_right_type = "AUTO"
        o = bpy.data.objects.new("you_mouth_" + kind, curve)
        bpy.context.collection.objects.link(o)
        curve.materials.append(mats["ink"])
        attach(o, head)
        mouths[kind] = o
    mouths["terrified"] = sphere("you_mouth_o", (0, surf(0, -0.058) + 0.004, -0.058), 0.016, (0.8, 0.3, 1.1),
                                 mats["ink"], parent=head, segments=16)
    return {"parts": parts, "head": head, "ball": ball, "eyes": eyes, "pupils": pupils, "brows": brows, "mouths": mouths,
            "clothes": {name: garment(name, spec, mats) for name, spec in GARMENTS.items()},
            "hood": sphere("you_hood", (0, 0, 0), 1.0, (1, 1, 1), mats["shirt"]), "body": hoodie_body(mats)}


GARMENTS = {  # sleeves and trousers: point -> (radius x, radius y), moved with your pose every frame
    "sleeve_l": ({"l_sh": (0.085, 0.085), "l_elbow": (0.075, 0.075), "l_cuff": (0.058, 0.058)},
                 [("l_sh", "l_elbow"), ("l_elbow", "l_cuff")], "shirt"),
    "sleeve_r": ({"r_sh": (0.085, 0.085), "r_elbow": (0.075, 0.075), "r_cuff": (0.058, 0.058)},
                 [("r_sh", "r_elbow"), ("r_elbow", "r_cuff")], "shirt"),
    "pants": ({"belt": (0.168, 0.118), "l_hip": (0.097, 0.097), "l_knee": (0.08, 0.08), "l_cuff": (0.07, 0.07),
               "r_hip": (0.097, 0.097), "r_knee": (0.08, 0.08), "r_cuff": (0.07, 0.07)},
              [("belt", "l_hip"), ("l_hip", "l_knee"), ("l_knee", "l_cuff"), ("belt", "r_hip"), ("r_hip", "r_knee"),
               ("r_knee", "r_cuff")], "pants"),
}
HOODIE = [  # body of the hoodie: (height above the hips, radius x, radius y); open at the bottom and the collar
    (-0.08, 0.176, 0.128), (-0.04, 0.184, 0.134), (0.01, 0.198, 0.144), (0.13, 0.19, 0.138), (0.27, 0.186, 0.134),
    (0.38, 0.2, 0.136), (0.46, 0.205, 0.132), (0.52, 0.15, 0.105), (0.555, 0.085, 0.072), (0.575, 0.072, 0.064)]


def hoodie_body(mats):
    """An open fabric tube from hip to collar: the hem with its band hangs naturally over the trousers."""
    n = 40
    verts, faces = [], []
    for z, rx, ry in HOODIE:
        verts += [(rx * math.cos(2 * math.pi * i / n), ry * math.sin(2 * math.pi * i / n), z) for i in range(n)]
    for r in range(len(HOODIE) - 1):
        for i in range(n):
            a, b = r * n + i, r * n + (i + 1) % n
            faces.append((a, b, b + n, a + n))
    mesh = bpy.data.meshes.new("hoodie")
    mesh.from_pydata(verts, [], faces)
    o = bpy.data.objects.new("you_hoodie", mesh)
    bpy.context.collection.objects.link(o)
    mesh.materials.append(mats["shirt"])
    o.modifiers.new("thickness", "SOLIDIFY").thickness = 0.012
    sub = o.modifiers.new("smooth", "SUBSURF")
    sub.levels = sub.render_levels = 2
    tex = bpy.data.textures.new("hoodie_wrinkles", "CLOUDS")
    tex.noise_scale = 0.06
    disp = o.modifiers.new("wrinkles", "DISPLACE")
    disp.texture, disp.strength, disp.mid_level = tex, 0.006, 0.5
    for poly in mesh.polygons:
        poly.use_smooth = True
    return o


COVERED = ("chest", "belly", "pelvis", "l_upper", "r_upper", "l_fore", "r_fore", "l_thigh", "r_thigh", "l_shin",
           "r_shin", "l_shoulder", "r_shoulder", "l_elbow", "r_elbow", "l_knee", "r_knee")


def garment(name, spec, mats):
    """A soft tube garment grown around a few points (skin modifier) with small fabric wrinkles."""
    points, bones, mat = spec
    o = skin_figure("you_" + name, {k: ((0, 0, i * 0.1), r) for i, (k, r) in enumerate(points.items())}, bones,
                    mats[mat])
    tex = bpy.data.textures.new(name + "_wrinkles", "CLOUDS")
    tex.noise_scale = 0.06
    disp = o.modifiers.new("wrinkles", "DISPLACE")
    disp.texture, disp.strength, disp.mid_level = tex, 0.007, 0.5
    return o


def rot(axis, deg):
    return Matrix.Rotation(math.radians(deg), 4, axis)


def pose_stickman(S, spec):
    """spec: loc (hips), yaw, torso [pitch, roll], head [yaw, pitch], arm_l/arm_r/leg_l/leg_r [forward, side, bend],
    face smile|flat|terrified. Facing -y before yaw; positive pitch leans forward; l = +x side."""
    st = S["stick"]
    objs = [*st["parts"].values(), st["head"], *st["head"].children, *st["clothes"].values(), st["hood"],
            st["body"]]
    show(objs, spec is not None)
    if spec is None:
        return None
    g = lambda k, d: spec.get(k, d)
    B = BODY
    H = Vector(g("loc", (0, 0, 0.95)))
    R0 = rot("Z", g("yaw", 0))
    tp, troll = g("torso", (0, 0))
    RT = R0 @ rot("X", tp) @ rot("Y", troll)
    at = lambda R, v: (R @ Vector(v).to_4d()).to_3d()
    neck = H + at(RT, (0, 0, B["torso"]))
    hy, hp = g("head", (0, 0))
    RH = RT @ rot("Z", hy) @ rot("X", hp)
    neck_top = neck + at(RH, (0, 0, B["neck"]))
    center = neck_top + at(RH, (0, 0, B["head"][2] * 0.85))
    J, bones = {}, {"neck": (neck, neck_top)}
    P = {"hem": H + at(RT, (0, 0, -0.01)), "waist": H + at(RT, (0, 0, 0.2)), "chest": H + at(RT, (0, 0, 0.37)),
         "collar": H + at(RT, (0, 0, 0.52)), "belt": H + at(R0, (0, 0, 0.05))}
    for side, sx in (("l", 1), ("r", -1)):
        shoulder = H + at(RT, (sx * B["shoulder"], 0, B["torso"] * 0.86))
        fwd, abd, bend = g(f"arm_{side}", (0, 8, 10))
        RA = RT @ rot("X", -fwd) @ rot("Y", -sx * abd)
        elbow = shoulder + at(RA, (0, 0, -B["upper"]))
        RF = RA @ rot("X", -bend)
        wrist = elbow + at(RF, (0, 0, -B["fore"]))
        hand_end = wrist + at(RF, (0, 0, -0.1))
        J[f"{side}_shoulder"], J[f"{side}_elbow"], J[f"{side}_hand"] = shoulder, elbow, (wrist + hand_end) / 2
        P[f"{side}_sh"], P[f"{side}_elbow"], P[f"{side}_cuff"] = shoulder, elbow, wrist + (elbow - wrist) * 0.12
        bones[f"{side}_upper"], bones[f"{side}_fore"], bones[f"{side}_hand"] = (shoulder, elbow), (elbow, wrist), \
            (wrist, hand_end)
        hip = H + at(R0, (sx * B["hip"], 0, -0.03))
        fwd, abd, bend = g(f"leg_{side}", (0, 3, 0))
        RL = R0 @ rot("X", -fwd) @ rot("Y", -sx * abd)
        knee = hip + at(RL, (0, 0, -B["thigh"]))
        RS = RL @ rot("X", bend)
        ankle = knee + at(RS, (0, 0, -B["shin"]))
        J[f"{side}_knee"], J[f"{side}_ankle"] = knee, ankle
        P[f"{side}_hip"], P[f"{side}_knee"], P[f"p_{side}_cuff"] = hip + at(R0, (0, 0, -0.04)), knee, \
            knee + (ankle - knee) * 0.96
        bones[f"{side}_thigh"], bones[f"{side}_shin"] = (hip, knee), (knee, ankle)
        foot = st["parts"][f"{side}_foot"]
        foot.matrix_world = Matrix.Translation(ankle + at(RS, (0, -0.06, -0.03))) @ RS @ Matrix.Diagonal(
            (0.045, 0.11, 0.035, 1))
    for name, (a, b) in bones.items():
        d = b - a
        q = Vector((0, 0, 1)).rotation_difference(d.normalized()) if d.length > 1e-6 else Quaternion()
        rx, ry = SEGMENTS[name]
        st["parts"][name].matrix_world = (Matrix.Translation((a + b) / 2) @ q.to_matrix().to_4x4()
                                          @ Matrix.Diagonal((rx, ry, max(d.length * 0.56, 1e-3), 1)))
    for name, (pos, radii) in TRUNK.items():
        st["parts"][name].matrix_world = Matrix.Translation(H + at(RT, pos)) @ RT @ Matrix.Diagonal((*radii, 1))
    for name in JOINTS:
        r = 0.058 if "shoulder" in name else (0.05 if "knee" in name else 0.043)
        st["parts"][name].matrix_world = Matrix.Translation(J[name]) @ Matrix.Diagonal((r, r, r, 1))
    st["head"].matrix_world = Matrix.Translation(center) @ RH
    for name, obj in st["clothes"].items():
        obj.matrix_world = Matrix.Identity(4)
        for v, key in zip(obj.data.vertices, GARMENTS[name][0]):
            v.co = P[f"p_{key}"] if name == "pants" and key.endswith("cuff") else P[key]
        obj.data.update()
    st["body"].matrix_world = Matrix.Translation(H) @ RT
    st["hood"].matrix_world = Matrix.Translation(H + at(RT, (0, 0.085, 0.5))) @ RT @ Matrix.Diagonal((0.14, 0.075, 0.1, 1))
    show([st["parts"][name] for name in COVERED], False)   # hidden under the clothes, so nothing pokes through
    expression = g("face", "smile")             # smile | worried (flat) | terrified | sleep
    face = {"worried": "flat", "sleep": "flat"}.get(expression, expression)
    for kind, o in st["mouths"].items():
        show([o], kind == face)
    scared, asleep = face == "terrified", expression == "sleep"
    for e in st["eyes"]:                        # eye and its black rim
        e.scale = (1.25, 0.3, 1.5) if scared else ((1.1, 0.3, 0.12) if asleep else (1, 0.3, 1.25))
    for pu in st["pupils"]:
        pu.scale = (0.65, 0.4, 0.7) if scared else ((0.01, 0.01, 0.01) if asleep else (1, 0.4, 1.1))
    for b, sx in zip(st["brows"], (-1, 1)):   # worried brows: inner ends up
        angle = 0 if asleep else {"smile": 0, "flat": 18, "terrified": 28}[face]
        b.rotation_euler = (0, math.pi / 2, 0)
        b.rotation_euler.rotate_axis("X", math.radians(-sx * angle))
        b.location.z = 0.07 + (0.012 if scared else 0)
    return {"r_hand": J["r_hand"], "l_hand": J["l_hand"]}, center


# ---------------------------------------------------------------- the apartment

def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    M = {
        "wall": material("wall", (0.50, 0.49, 0.46), 0.85),
        "ceiling": material("ceiling", (0.55, 0.55, 0.53), 0.9),
        "floor": material("floor", (0.16, 0.10, 0.065), 0.32),
        "door": material("door", (0.62, 0.61, 0.58), 0.45),
        "metal": material("metal", (0.75, 0.75, 0.75), 0.25, 1.0),
        "wood": material("wood", (0.20, 0.12, 0.07), 0.5),
        "sheet": material("sheet", (0.45, 0.46, 0.48), 0.9),
        "blanket": material("blanket", (0.05, 0.07, 0.12), 0.95),
        "black": material("black", (0.01, 0.01, 0.01), 0.9),
        "cloth": material("cloth", (0.06, 0.06, 0.07), 0.95),
        "phone": material("phone", (0.01, 0.01, 0.012), 0.2, 0.3),
        "lamp_on": material("lamp_on", (1, 1, 1), emit=(1, 0.84, 0.6), strength=8),
        "lamp_off": material("lamp_off", (0.7, 0.7, 0.68), 0.4),
        "glow": material("glow", (1, 1, 1), emit=(1, 0.8, 0.55), strength=1.5),
        "vis_body": material("vis_body", (0.012, 0.011, 0.011), 0.85),
        "vis_skin": material("vis_skin", (0.46, 0.47, 0.47), 0.45),
        "void": material("void", (0.0, 0.0, 0.0), 1.0),
        "you": material("you", (0.12, 0.12, 0.13), 0.9),
        "stair": material("stair", (0.18, 0.18, 0.19), 0.8),
        "chalk": material("chalk", (0.86, 0.86, 0.84), 0.45, emit=(1, 1, 1), strength=0.04),
        "shirt": material("shirt", (0.38, 0.38, 0.40), 0.95),
        "pants": material("pants", (0.05, 0.05, 0.055), 0.95),
        "band": material("band", (0.3, 0.3, 0.32), 0.95),
        "eye": material("eye", (0.97, 0.97, 0.97), 0.3, emit=(1, 1, 1), strength=0.45),
        "ink": material("ink", (0.0, 0.0, 0.0), 1.0),
    }
    M["ink"].use_backface_culling = True
    W, H = M["wall"], 2.6
    # floor and ceilings
    box("floor", -2.2, 8.0, -0.2, 4.9, -0.05, 0, M["floor"])
    box("ceil_bed", -0.1, 3.7, -0.1, 3.5, H, H + 0.1, M["ceiling"])
    box("ceil_hall", -2.1, 6.1, 3.5, 4.8, H, H + 0.1, M["ceiling"])
    # bedroom walls: south, west, east (window y 1.2-2.4, z 0.9-2.1), north (door x 2.4-3.3)
    box("w_s", -0.1, 3.7, -0.1, 0, 0, H, W)
    box("w_w", -0.1, 0, 0, 3.5, 0, H, W)
    box("w_e1", 3.6, 3.7, 0, 1.2, 0, H, W)
    box("w_e2", 3.6, 3.7, 2.4, 3.5, 0, H, W)
    box("w_e3", 3.6, 3.7, 1.2, 2.4, 0, 0.9, W)
    box("w_e4", 3.6, 3.7, 1.2, 2.4, 2.1, H, W)
    box("w_n1", -2.1, 2.4, 3.4, 3.5, 0, H, W)
    box("w_n2", 3.3, 6.1, 3.4, 3.5, 0, H, W)
    box("w_n3", 2.4, 3.3, 3.4, 3.5, 2.05, H, W)
    # hallway: north wall, west end, east end with the front door (y 3.65-4.55)
    box("h_n", -2.1, 6.1, 4.7, 4.8, 0, H, W)
    box("h_w", -2.1, -2.0, 3.5, 4.7, 0, H, W)
    box("h_e1", 6.0, 6.1, 3.5, 3.65, 0, H, W)
    box("h_e2", 6.0, 6.1, 4.55, 4.7, 0, H, W)
    box("h_e3", 6.0, 6.1, 3.65, 4.55, 2.1, H, W)
    # door frames and skirting give the eye something to hold on to
    for x in (2.36, 3.3):
        box(f"frame{x}", x, x + 0.04, 3.38, 3.52, 0, 2.09, M["door"])
    box("frame_top", 2.36, 3.34, 3.38, 3.52, 2.05, 2.09, M["door"])
    # bedroom door: hinge at x 2.42, opens into the bedroom; 2 cm gap at the bottom
    door_pivot = empty("door_pivot", (2.42, 3.45, 0))
    box("door", 2.42, 3.28, 3.43, 3.47, 0.02, 2.03, M["door"], bevel=0.004, parent=door_pivot)
    handle_pivot = empty("handle_pivot", (3.17, 3.415, 1.0), parent=door_pivot)
    cylinder("rosette", (3.17, 3.422, 1.0), 0.028, 0.012, M["metal"], rot=(math.pi / 2, 0, 0), parent=door_pivot)
    box("lever", 3.04, 3.17, 3.392, 3.41, 0.99, 1.01, M["metal"], bevel=0.006, parent=handle_pivot)
    cylinder("lever_neck", (3.17, 3.405, 1.0), 0.01, 0.03, M["metal"], rot=(math.pi / 2, 0, 0), parent=handle_pivot)
    # other hallway doors and coats by the front door
    for x0, x1 in ((0.9, 1.75), (-1.6, -0.75)):
        box(f"hdoor{x0}", x0, x1, 4.66, 4.7, 0, 2.03, M["door"], bevel=0.004)
        cylinder(f"hknob{x0}", (x1 - 0.1, 4.65, 1.0), 0.025, 0.04, M["metal"], rot=(math.pi / 2, 0, 0))
    for i, y in enumerate((4.35, 4.5)):
        box(f"coat{i}", 5.75, 5.95, y - 0.12, y + 0.12, 0.75, 1.75, M["cloth"], bevel=0.05)
    box("shoes", 5.5, 5.95, 3.55, 3.85, 0, 0.12, M["black"], bevel=0.02)
    # apartment door: hinge at y 3.65, opens inward; dark stairwell outside
    front_pivot = empty("front_pivot", (6.03, 3.65, 0))
    box("front_door", 6.01, 6.07, 3.66, 4.54, 0.0, 2.08, M["stair"], bevel=0.004, parent=front_pivot)
    box("stair_floor", 6.1, 8.0, 2.5, 5.5, -0.05, 0, M["stair"])
    box("stair_back", 7.9, 8.0, 2.5, 5.5, 0, 3.0, M["stair"])
    box("stair_l", 6.1, 8.0, 2.4, 2.5, 0, 3.0, M["stair"])
    box("stair_r", 6.1, 8.0, 5.5, 5.6, 0, 3.0, M["stair"])
    box("stair_top", 6.1, 8.0, 2.4, 5.6, 3.0, 3.1, M["stair"])
    point_light("stair_light", (7.3, 4.1, 2.6), 25, (0.6, 0.75, 1.0), 0.3)
    # hallway lamp (on/off) and the light that leaks under the bedroom door
    lamp_panel = box("hall_lamp", 2.65, 3.05, 3.9, 4.3, H - 0.03, H, M["lamp_off"])
    hall_light = area_light("hall_light", (2.85, 4.1, H - 0.05), (2.85, 4.1, 0), 70, 0.4, (1, 0.84, 0.62))
    hall_fill = point_light("hall_fill", (0.5, 4.1, 2.2), 12, (1, 0.84, 0.62), 0.5)
    # bedroom furniture
    box("bed_frame", 0.0, 2.1, 0.85, 2.55, 0, 0.3, M["wood"], bevel=0.01)
    box("mattress", 0.05, 2.08, 0.88, 2.52, 0.3, 0.5, M["sheet"], bevel=0.04)
    box("blanket", 0.7, 2.12, 0.84, 2.56, 0.45, 0.58, M["blanket"], bevel=0.06)
    box("pillow", 0.1, 0.6, 1.15, 2.25, 0.5, 0.64, M["sheet"], bevel=0.06)
    box("headboard", 0.0, 0.07, 0.85, 2.55, 0, 1.05, M["wood"], bevel=0.01)
    box("nightstand", 0.05, 0.5, 0.3, 0.8, 0, 0.55, M["wood"], bevel=0.008)
    cylinder("lamp_base", (0.15, 0.4, 0.6), 0.05, 0.1, M["black"])
    cylinder("lamp_shade", (0.15, 0.4, 0.78), 0.1, 0.2, M["sheet"])
    cylinder("mug", (0.12, 0.72, 0.6), 0.04, 0.1, M["sheet"])
    box("chair_seat", 3.0, 3.45, 2.45, 2.9, 0.42, 0.47, M["wood"], bevel=0.01)
    box("chair_back", 3.4, 3.45, 2.45, 2.9, 0.47, 1.0, M["wood"], bevel=0.01)
    for x in (3.02, 3.4):
        for y in (2.47, 2.86):
            box(f"leg{x}{y}", x, x + 0.03, y, y + 0.03, 0, 0.42, M["wood"])
    box("jacket", 3.15, 3.5, 2.5, 2.85, 0.47, 1.15, M["cloth"], bevel=0.08)
    box("bed_lamp", 1.6, 2.0, 1.5, 1.9, H - 0.03, H, M["lamp_off"])
    # wardrobe (x 2.5-3.5, y 0-0.6): body, coats inside, two doors with a 3 cm slit at x 3.0
    WD = M["wood"]
    box("wr_back", 2.5, 3.5, 0, 0.03, 0, 2.1, WD)
    box("wr_l", 2.5, 2.53, 0, 0.6, 0, 2.1, WD)
    box("wr_r", 3.47, 3.5, 0, 0.6, 0, 2.1, WD)
    box("wr_top", 2.5, 3.5, 0, 0.6, 2.07, 2.1, WD)
    box("wr_bottom", 2.5, 3.5, 0, 0.6, 0, 0.05, WD)
    cylinder("wr_rail", (3.0, 0.3, 1.9), 0.012, 0.94, M["metal"], rot=(0, math.pi / 2, 0))
    for i, x in enumerate((2.6, 2.7, 2.8, 3.22, 3.32, 3.42)):
        box(f"wr_coat{i}", x - 0.03, x + 0.03, 0.1, 0.5, 0.9, 1.88, M["cloth"], bevel=0.02)
    box("wr_door_l", 2.5, 2.97, 0.6, 0.63, 0.05, 2.07, WD, bevel=0.003)
    wr_pivot = empty("wr_pivot", (3.5, 0.615, 0))
    box("wr_door_r", 3.03, 3.5, 0.6, 0.63, 0.05, 2.07, WD, bevel=0.003, parent=wr_pivot)
    # window with blinds; moonlight from outside
    for i in range(16):
        z = 0.95 + i * 0.072
        s = box(f"slat{i}", 3.62, 3.66, 1.22, 2.38, z, z + 0.004, M["sheet"])
        s.rotation_euler = (0, math.radians(35), 0)
    area_light("moon", (5.2, 1.5, 3.2), (2.0, 1.9, 0.3), 450, 1.2, (0.45, 0.58, 1.0))
    point_light("room_fill", (1.8, 1.7, 2.3), 5, (0.55, 0.65, 1.0), 0.5)
    # phone with a screen texture
    phone = empty("phone", (0, 0, 0))
    box("phone_body", -0.036, 0.036, -0.075, 0.075, -0.004, 0.004, M["phone"], bevel=0.006, parent=phone)
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, 0.0045))
    screen = bpy.context.object
    screen.scale = (0.066, 0.144, 1)
    bpy.ops.object.transform_apply(scale=True)
    smat = bpy.data.materials.new("screen")
    smat.use_nodes = True
    nodes, links = smat.node_tree.nodes, smat.node_tree.links
    nodes.clear()
    tex, em, out = nodes.new("ShaderNodeTexImage"), nodes.new("ShaderNodeEmission"), nodes.new("ShaderNodeOutputMaterial")
    em.inputs["Strength"].default_value = 1.6
    links.new(tex.outputs["Color"], em.inputs["Color"])
    links.new(em.outputs[0], out.inputs[0])
    screen.data.materials.append(smat)
    attach(screen, phone)
    phone_light = area_light("phone_light", (0, 0, 0.05), (0, 0, 1), 1.2, 0.07, (0.75, 0.85, 1.0), size_y=0.15)
    attach(phone_light, phone)
    # people
    vis_root, vis_parts = visitor(M)
    hand = visitor_hand(M)
    you = person(M)
    stick = stickman(M)
    # glow near the camera, infrared light of the hallway camera
    gdata = bpy.data.lights.new("glow", "SPOT")       # your phone's light, pointing where you look
    gdata.color, gdata.spot_size, gdata.spot_blend, gdata.shadow_soft_size = (0.72, 0.84, 1.0), math.radians(85), 0.9, 0.04
    glow = bpy.data.objects.new("glow", gdata)
    bpy.context.collection.objects.link(glow)
    idata = bpy.data.lights.new("ir", "SPOT")          # infrared lamp of the hallway camera
    idata.energy, idata.spot_size, idata.spot_blend, idata.shadow_soft_size = 70, math.radians(80), 1.0, 0.05
    ir = bpy.data.objects.new("ir", idata)
    bpy.context.collection.objects.link(ir)
    ir.location = (5.7, 4.45, 2.3)
    ir.rotation_euler = (Vector((2.2, 3.9, 0.7)) - Vector(ir.location)).to_track_quat("-Z", "Y").to_euler()
    # camera, world haze, render settings
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    bpy.context.collection.objects.link(cam)
    sc.camera = cam
    world = bpy.data.worlds.new("world")
    sc.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.002, 0.003, 0.006, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 1.0
    vol = world.node_tree.nodes.new("ShaderNodeVolumePrincipled")
    vol.inputs["Density"].default_value = 0.035
    world.node_tree.links.new(vol.outputs[0], world.node_tree.nodes["World Output"].inputs["Volume"])
    e = sc.eevee
    e.use_volumetric_lights, e.use_volumetric_shadows, e.volumetric_tile_size = True, True, "4"
    e.volumetric_end = 30
    e.use_bloom, e.bloom_intensity, e.bloom_threshold = True, 0.03, 1.2
    e.use_gtao, e.gtao_distance = True, 0.6
    e.use_ssr, e.use_soft_shadows = True, True
    e.shadow_cube_size, e.shadow_cascade_size = "1024", "1024"
    sc.view_settings.view_transform, sc.view_settings.look = "Filmic", "Medium High Contrast"
    sc.render.engine = "BLENDER_EEVEE"
    sc.render.image_settings.file_format = "PNG"
    return {
        "sc": sc, "cam": cam, "door": door_pivot, "handle": handle_pivot, "wardrobe": wr_pivot,
        "front": front_pivot, "lamp_panel": lamp_panel, "hall_light": hall_light, "hall_fill": hall_fill,
        "glow_mat": M["glow"], "lamp_on": M["lamp_on"], "lamp_off": M["lamp_off"], "phone": phone,
        "screen_tex": tex, "phone_light": phone_light, "vis": vis_root, "vis_parts": vis_parts,
        "hand": hand, "you": you, "glow": glow, "ir": ir, "strips": [], "stick": stick,
        "neck": bpy.data.objects["vis_neck"],
    }


def under_door(S, on, feet):
    """The warm line of light under the bedroom door, optionally broken by two feet."""
    for o in S["strips"]:
        bpy.data.objects.remove(o, do_unlink=True)
    S["strips"] = []
    if not on:
        return
    gaps = [(2.62, 2.74), (2.92, 3.04)] if feet else []
    edges = [2.45] + [x for g in gaps for x in g] + [3.25]
    for x0, x1 in zip(edges[::2], edges[1::2]):
        strip = box(f"strip{x0}", x0, x1, 3.395, 3.40, 0.0, 0.009, S["glow_mat"])
        light = area_light(f"gap{x0}", ((x0 + x1) / 2, 3.39, 0.012), ((x0 + x1) / 2, 2.4, -0.25), 4.0 * (x1 - x0) / 0.8,
                           x1 - x0, (1, 0.8, 0.55), size_y=0.015)
        S["strips"] += [strip, light]


VISITOR_POSES = {
    # name: (location, rotation z in degrees, lean forward in degrees)
    "hall_door": ((2.85, 3.95, 0), 0, 4),           # in the hallway, facing the bedroom door
    "front_behind": ((4.5, 4.38, 0), -90, 6),       # right behind you as you come home
    "entering": ((2.95, 3.6, 0), 0, 8),             # stepping into the bedroom doorway
    "door_gap": ((3.25, 3.9, -0.12), -15, 6),       # face peeking through the opened door
    "in_wardrobe": ((3.03, 0.47, -0.3), 180, 0),    # crouched inside the wardrobe, face at the gap
    "front_of_wardrobe": ((3.0, 0.95, 0), 0, 6),    # standing right in front of the wardrobe slit
    "eye_slit": ((3.0, 1.79, -0.25), 0, 25),        # bent down, face right outside the slit
}

SHOTS = {
    # name: (camera location, target, lens)
    "bed_pov": ((0.6, 1.75, 1.25), (2.85, 3.4, 0.75), 20),
    "phone_nightstand": ((0.37, 0.77, 0.87), (0.3, 0.6, 0.555), 60),
    "door_bottom": ((2.6, 2.35, 0.18), (2.85, 3.4, 0.05), 24),
    "handle_close": ((2.92, 2.95, 1.12), (3.12, 3.4, 0.98), 32),
    "door_gap": ((3.45, 2.6, 1.6), (3.25, 3.45, 1.72), 24),
    "cctv": ((5.9, 4.6, 2.45), (0.0, 3.7, 0.5), 13),
    "wardrobe_view": ((2.95, 2.2, 1.55), (3.05, 0.5, 1.45), 26),
    "wardrobe_close": ((3.1, 1.25, 1.52), (3.03, 0.6, 1.5), 30),
    "wardrobe_slit": ((3.0, 0.5, 1.45), (2.85, 3.4, 1.15), 20),
}

PHONE_SPOTS = {
    "nightstand": ((0.3, 0.6, 0.555), (0, 0, math.radians(166))),
}


def apply(S, state):
    st = {**DEFAULT, **state}
    S["door"].rotation_euler = (0, 0, -math.radians(st["door"]))
    S["handle"].rotation_euler = (0, math.radians(st["handle"]), 0)
    S["wardrobe"].rotation_euler = (0, 0, -math.radians(st["wardrobe"]))
    S["front"].rotation_euler = (0, 0, math.radians(st["front_door"]))
    on = st["hall_light"]
    S["lamp_panel"].data.materials[0] = S["lamp_on"] if on else S["lamp_off"]
    show([S["hall_light"], S["hall_fill"]], on)
    under_door(S, on and st["door"] == 0, st["feet"])
    show([S["ir"]], st["ir"])
    body = bpy.data.materials["vis_body"].node_tree.nodes["Principled BSDF"].inputs["Base Color"]
    body.default_value = (0.06, 0.06, 0.06, 1) if st["ir"] else (0.012, 0.011, 0.011, 1)
    # figures
    v = st["visitor"]
    pose = (v["loc"], v.get("rot", 0), v.get("lean", 0)) if isinstance(v, dict) else VISITOR_POSES.get(v)
    show([S["vis"], *S["vis_parts"], *S["vis"].children, S["neck"]], bool(pose))
    S["vis"].scale = (1.12, 1.12, 1.12)
    S["neck"].rotation_euler = (0, math.radians(st["tilt"]), 0)
    if pose:
        loc, rz, lean = pose
        S["vis"].location = loc
        S["vis"].rotation_euler = (0, 0, math.radians(rz))
        S["vis"].rotation_euler.rotate_axis("X", math.radians(lean))  # lean towards the face
    hand_pose = {"in_wardrobe": ((3.03, 0.66, 1.35), (0, 0, math.radians(180)))}.get(v if isinstance(v, str) else None)
    show([S["hand"], *S["hand"].children], bool(hand_pose))
    if hand_pose:
        S["hand"].location, S["hand"].rotation_euler = hand_pose
    show([S["you"], *S["you"].children], st["you"])
    S["you"].location, S["you"].rotation_euler = (3.75, 3.92, 0), (0, 0, math.radians(-90))
    # phone
    show([S["phone"], *S["phone"].children], bool(st["screen"]))
    if st["screen"]:
        img = bpy.data.images.load(os.path.abspath(st["screen"]), check_existing=True)
        S["screen_tex"].image = img
    S["glow"].data.energy = st["glow"]
    S["sc"].view_settings.exposure = st["exposure"]


def place_phone(S, shot, where):
    cam = S["cam"]
    S["phone_light"].data.energy = 1.2 if where == "nightstand" else 0.3
    if where == "nightstand":
        loc, rot = PHONE_SPOTS["nightstand"]
        S["phone"].location, S["phone"].rotation_euler = loc, rot
        return
    # held in front of the camera, slightly below the centre, tilted towards you
    bpy.context.view_layer.update()
    m = cam.matrix_world
    S["phone"].location = m @ Vector((0.0, -0.02, -0.19))
    tilt = Quaternion((1, 0, 0), math.radians(-8)) @ Quaternion((0, 0, 1), math.radians(4))
    S["phone"].rotation_euler = (m.to_quaternion() @ tilt).to_euler()


def render(S, job):
    st = {**DEFAULT, **job.get("state", {})}
    shot = job.get("shot")
    c = job.get("camera")
    loc, target, lens = (c["loc"], c["target"], c.get("lens", 24)) if c else SHOTS[shot]
    look(S["cam"], loc, target, lens, (c or {}).get("roll", job.get("roll", 0.0)))
    cam = S["cam"].data
    cam.dof.use_dof = bool(job.get("dof"))
    if cam.dof.use_dof:
        cam.dof.focus_distance, cam.dof.aperture_fstop = job["dof"], 1.8
    apply(S, st)
    posed = pose_stickman(S, st["stick"])
    if st["screen"] and st["phone"] == "hand" and posed:
        J, center = posed
        S["phone_light"].data.energy = 0.6
        S["phone"].location = J["r_hand"] + (center - J["r_hand"]).normalized() * 0.045 + Vector((0, 0, 0.06))
        S["phone"].rotation_euler = (center - J["r_hand"]).to_track_quat("Z", "Y").to_euler()
    elif st["screen"]:
        place_phone(S, shot, st["phone"])
    if st["glow"]:
        bpy.context.view_layer.update()
        S["glow"].location = S["cam"].matrix_world @ Vector((0.06, -0.12, -0.05))
        S["glow"].rotation_euler = S["cam"].rotation_euler
    sc = S["sc"]
    sc.render.resolution_x, sc.render.resolution_y = job.get("res", (1080, 1920))
    sc.eevee.taa_render_samples = job.get("samples", 32)
    sc.render.filepath = os.path.abspath(job["out"])
    bpy.ops.render.render(write_still=True)


def main():
    jobs = json.loads(open(sys.argv[sys.argv.index("--") + 1]).read())
    todo = [j for j in jobs if not os.path.exists(j["out"])]
    if not todo:
        return
    S = build()
    for i, job in enumerate(todo, 1):
        os.makedirs(os.path.dirname(os.path.abspath(job["out"])), exist_ok=True)
        render(S, job)
        print(f"RENDERED {i}/{len(todo)} {job['out']}", flush=True)


if __name__ == "__main__":
    main()
