"""Build one episode of "PERSON DETECTED": phone screens, 3D renders, voices, sound, edit, mp4.

    .venv/bin/python tiktok/horror/make.py tiktok/horror/episodes/part1.json            # final
    .venv/bin/python tiktok/horror/make.py tiktok/horror/episodes/part1.json --preview  # fast, small renders
    .venv/bin/python tiktok/horror/make.py ... --renders-only                           # just the 3D shots

Renders and voices are cached under data/horror, so a re-run only redoes what changed."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import subprocess
import sys
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
import sound  # noqa: E402
import ui  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data" / "horror"
OUT = ROOT / "tiktok" / "videos"
FPS, W, H = 24, 1080, 1920
LINE_GAP = 0.45   # a breath between two spoken lines


# ---------------------------------------------------------------- 3D renders

SCENE_VERSION = hashlib.sha1((Path(__file__).parent / "apartment.py").read_bytes()).hexdigest()[:8]


def lerp(a, b, k):
    """Interpolate numbers, lists and dicts of numbers; anything else switches at k >= 0.5."""
    if isinstance(a, (int, float)) and isinstance(b, (int, float)) and not isinstance(a, bool):
        return a + (b - a) * k
    if isinstance(a, list) and isinstance(b, list) and len(a) == len(b):
        return [lerp(x, y, k) for x, y in zip(a, b)]
    if isinstance(a, dict) and isinstance(b, dict):
        return {key: lerp(a.get(key, b.get(key)), b.get(key, a.get(key)), k) for key in {*a, *b}}
    return b if k >= 0.5 else a


def at_keys(keys, k):
    """State of a keyframed shot at k in 0..1 (smooth in and out between neighbouring keys)."""
    prev = keys[0]
    for nxt in keys[1:]:
        if k <= nxt["at"]:
            span = max(1e-6, nxt["at"] - prev["at"])
            u = min(1.0, max(0.0, (k - prev["at"]) / span))
            u = u * u * (3 - 2 * u) if nxt.get("ease", True) else u
            return lerp({kk: v for kk, v in prev.items() if kk != "at"}, {kk: v for kk, v in nxt.items() if kk != "at"}, u)
        prev = nxt
    return {kk: v for kk, v in prev.items() if kk != "at"}


def humanize(keys, k, t, stick):
    """Natural motion for you (the mannequin): head and arms follow the body a moment later, breathing and small
    idle movements, trembling when scared, and a walk cycle when stick has "walk": steps per second."""
    if not stick:
        return stick
    stick = dict(stick)
    for part, lag in (("head", 0.05), ("arm_l", 0.09), ("arm_r", 0.09)):
        late = (at_keys(keys, max(0.0, k - lag)).get("state", {}).get("stick") or {}) if keys else {}
        if part in late:
            stick[part] = late[part]
    wave = lambda period, phase=0.0: math.sin(2 * math.pi * t / period + phase)
    torso = list(stick.get("torso", [0, 0]))
    head = list(stick.get("head", [0, 0]))
    torso[0] += 1.3 * wave(3.6)
    torso[1] += 0.7 * wave(5.3, 1.0)
    head[0] += 1.8 * wave(4.7, 1.0)
    head[1] += 1.2 * wave(3.9, 2.0)
    arms = {side: list(stick.get(side, [0, 8, 10])) for side in ("arm_l", "arm_r")}
    for n, side in enumerate(arms):
        arms[side][2] += 3 * wave(3.6, n)
    if stick.get("face") == "terrified" or stick.get("tremble"):
        shake = lambda ph: 1.4 * (math.sin(t * 47 + ph) + 0.6 * math.sin(t * 71 + 2 * ph))
        head = [head[0] + shake(0), head[1] + shake(1)]
        for n, side in enumerate(arms):
            arms[side][0] += shake(2 + n)
            arms[side][2] += shake(4 + n)
    if stick.get("walk"):
        phase = 2 * math.pi * t * stick["walk"] / 2
        swing = math.sin(phase)
        stick["leg_l"] = [22 * swing, 3, 35 * max(0.0, math.sin(phase + math.pi / 2))]
        stick["leg_r"] = [-22 * swing, 3, 35 * max(0.0, math.sin(phase - math.pi / 2))]
        arms["arm_l"][0] -= 14 * swing
        arms["arm_r"][0] += 14 * swing
        torso[0] += 4
        loc = list(stick["loc"])
        loc[2] += 0.02 * abs(math.cos(phase))
        stick["loc"] = loc
    stick.update(torso=torso, head=head, **arms)
    return stick


def render_key(spec: dict, screen: dict | None, quality: tuple) -> str:
    """Cache key of a render; changes whenever the shot, the screen or the 3D scene itself changes."""
    blob = json.dumps([spec.get("cam"), spec.get("camera"), spec.get("state", {}), spec.get("dof"), screen, quality,
                       SCENE_VERSION],
                      sort_keys=True)
    return hashlib.sha1(blob.encode()).hexdigest()[:14]


def plan_renders(ep: dict, preview: bool):
    """Every shot becomes one still or a list of animation frames; returns jobs and shot -> file(s)."""
    res, samples, anim_samples = ((432, 768), 8, 6) if preview else ((1080, 1920), 32, 16)
    anim_res = res if preview else (810, 1440)
    folder = DATA / ("renders-preview" if preview else "renders")
    jobs, files = [], {}
    for name, spec in ep["shots"].items():
        if spec.get("cam") is None and spec.get("camera") is None and not spec.get("anim", {}).get("keys"):
            continue
        state = dict(spec.get("state", {}))
        screen = ep["screens"].get(state["screen"]) if state.get("screen") else None
        if screen is not None:
            state["screen"] = str(ui.phone_screen(screen, DATA / "ui" / f"{render_key({}, screen, ())}.png"))
        anim = spec.get("anim")
        if anim:
            frames = []
            n = anim["frames"] if "frames" in anim else max(2, round(anim["seconds"] * FPS))
            n = max(2, n // 4) if preview else n
            for i in range(n):
                k = i / (n - 1)
                camera = spec.get("camera")
                if "keys" in anim:
                    cur = at_keys(anim["keys"], k)
                    st = {**state, **cur.get("state", {})}
                    camera = cur.get("camera", camera)
                    st["stick"] = humanize(anim["keys"], k, k * anim.get("seconds", n / FPS), st.get("stick"))
                else:
                    kk = k * k * (3 - 2 * k)
                    st = {**state, anim["param"]: anim["from"] + (anim["to"] - anim["from"]) * kk}
                key = render_key({**spec, "state": st, "camera": camera}, screen, (anim_res, anim_samples))
                out = folder / f"{key}.png"
                jobs.append({"out": str(out), "shot": spec.get("cam"), "camera": camera, "state": st,
                             "samples": anim_samples, "res": anim_res, **({"dof": spec["dof"]} if spec.get("dof") else {})})
                frames.append(out)
            files[name] = frames
        else:
            key = render_key({**spec, "state": state}, screen, (res, samples))
            out = folder / f"{key}.png"
            jobs.append({"out": str(out), "shot": spec.get("cam"), "camera": spec.get("camera"), "state": state,
                         "samples": samples, "res": res, **({"dof": spec["dof"]} if spec.get("dof") else {})})
            files[name] = [out]
    return jobs, files


def run_blender(jobs):
    todo = [j for j in jobs if not Path(j["out"]).exists()]
    if not todo:
        return
    print(f"Rendere {len(todo)} Bilder in 3D …", flush=True)
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
        json.dump(todo, f)
    cmd = ["blender", "-b", "--factory-startup", "-P", str(Path(__file__).parent / "apartment.py"), "--", f.name]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    for line in proc.stdout:
        if line.startswith("RENDERED") or "Error" in line and "EGL" not in line:
            print("  " + line.strip(), flush=True)
    if proc.wait():
        raise SystemExit("Blender ist fehlgeschlagen")


# ---------------------------------------------------------------- timeline

@dataclass
class Line:
    text: str
    sub: str
    whisper: bool
    audio: np.ndarray
    start: float = 0.0     # relative to the beat

    @property
    def dur(self):
        return len(self.audio) / sound.SR


@dataclass
class Beat:
    spec: dict
    lines: list[Line]
    start: float = 0.0
    dur: float = 0.0
    extra: dict = field(default_factory=dict)


def build_timeline(ep: dict):
    beats, t = [], 0.0
    for spec in ep["beats"]:
        lines = []
        for item in spec.get("say", []):
            spoken, sub = (item, item) if isinstance(item, str) else item
            lines.append(Line(spoken, sub, False, sound.narrator(spoken.replace("*", ""))))
        for item in spec.get("whisper", []):
            spoken, sub = (item, item) if isinstance(item, str) else item
            lines.append(Line(spoken, sub, True, sound.whisper(spoken.replace("*", ""))))
        cursor = spec.get("pre", 0.25)
        for line in lines:
            line.start = cursor
            cursor += line.dur + LINE_GAP
        speech = cursor - (LINE_GAP if lines else 0) + spec.get("post", 0.35)
        beat = Beat(spec, lines, t, max(spec.get("dur", 0.0), speech if lines else spec.get("dur", 1.0)))
        beats.append(beat)
        t += beat.dur
    choice = ep.get("choice")
    if not choice:
        return beats
    say = sound.narrator(choice["say"])
    beats.append(Beat({"shot": "__choice__"}, [Line(choice["say"], "", False, say, 0.5)], t,
                      max(7.5, 0.5 + len(say) / sound.SR + 1.6)))
    return beats


def subtitle_chunks(line: Line):
    """Split a line into evenly sized chunks of at most 4 words, timed by their length."""
    words = line.sub.split()
    groups, cur = [], []
    for w in words:          # first break after punctuation, then balance long groups
        cur.append(w)
        if w.endswith((".", ",", "?", "!", "…")):
            groups.append(cur)
            cur = []
    if cur:
        groups.append(cur)
    chunks = []
    for g in groups:
        n = -(-len(g) // 4)
        size = -(-len(g) // n)
        chunks += [" ".join(g[i:i + size]) for i in range(0, len(g), size)]
    total = sum(len(c) for c in chunks) or 1
    t, out = line.start, []
    for c in chunks:
        d = line.dur * len(c) / total
        out.append((t, t + d, c))
        t += d
    return out


# ---------------------------------------------------------------- sound

def build_audio(ep, beats, total):
    """Voice on top, sound effects where they happen (with stereo pan), and a score that follows the beats'
    "music" labels (drone -> pulse60 -> pulse90 -> riser -> silence -> outro)."""
    voice, sfx, silence = [], [], []
    n = int(total * sound.SR)
    score = np.zeros(n + sound.SR)
    groups, label = [], "drone"
    for b in beats:
        for line in b.lines:
            pan = b.spec.get("pan", 0.0) if line.whisper else 0.0
            voice.append((b.start + line.start, line.audio, 1.15 if line.whisper else 1.0, pan))
        for name, at, *rest in b.spec.get("sfx", []):
            sfx.append((b.start + at, sound.SFX[name](), rest[0] if rest else 1.0, rest[1] if len(rest) > 1 else 0.0))
        if b.spec.get("silence"):
            silence.append((b.start, b.start + b.dur))
        if b.spec.get("scare"):
            sfx += [(b.start, sound.stinger(), 1.4, 0.0), (b.start, sound.impact(), 1.2, 0.0),
                    (b.start + 0.4, sound.ring(), 1.0, 0.0)]
        if b.spec.get("heart"):
            x = sound.heartbeat(b.dur + 0.05, b.spec["heart"])
            i = int(b.start * sound.SR)
            score[i:i + len(x)] += x[:len(score) - i]
        label = "outro" if b.spec["shot"] == "__choice__" else b.spec.get("music", label)
        if groups and groups[-1][0] == label:
            groups[-1][2] = b.start + b.dur
        else:
            groups.append([label, b.start, b.start + b.dur])
    fade = int(0.25 * sound.SR)
    for label, a, e in groups:
        x = sound.music(label, e - a + 0.25, a)
        x[:fade] *= np.linspace(0, 1, fade)
        x[-fade:] *= np.linspace(1, 0, fade)
        i = int(a * sound.SR)
        score[i:i + len(x)] += x[:len(score) - i]
    score[:n] += sound.room_tone(total)[:n]
    return sound.mix(total, voice, sfx, score[:n], silence)


# ---------------------------------------------------------------- picture

class Shots:
    def __init__(self, ep, files):
        self.ep, self.files, self.cache = ep, files, {}
        self.vignette = self._vignette()

    @staticmethod
    def _vignette():
        y, x = np.mgrid[0:H, 0:W]
        r = np.sqrt(((x - W / 2) / (W / 2)) ** 2 + ((y - H / 2) / (H / 2)) ** 2)
        return np.clip(1.08 - 0.18 * r ** 2, 0.8, 1.0)[..., None].astype(np.float32)

    def frame(self, name, index=0):
        key = (name, index)
        if key not in self.cache:
            if len(self.cache) > 120:
                self.cache.clear()
            spec = self.ep["shots"][name]
            if spec.get("cam") is None and spec.get("camera") is None and not spec.get("anim"):
                img = np.zeros((H, W, 3), np.float32)
            else:
                path = self.files[name][min(index, len(self.files[name]) - 1)]
                img = np.asarray(Image.open(path).convert("RGB").resize((W, H), Image.BICUBIC), np.float32) / 255
                img = grade(img, spec.get("grade", "night"), spec.get("gain", 1.0)) * self.vignette
            self.cache[key] = img
        return self.cache[key]


def grade(img, kind, gain):
    if kind in ("cctv", "ir"):
        gray = img @ np.array([0.3, 0.59, 0.11], np.float32)
        if kind == "ir":
            img = np.repeat(gray[..., None], 3, axis=2) * np.array([0.92, 1.0, 0.95], np.float32) * 0.9
        else:
            img = img * 0.35 + gray[..., None] * 0.65
        return np.clip((img * gain - 0.03) * 1.25, 0, 1) ** 0.85
    img = img * gain
    img = img + np.array([0.008, 0.012, 0.022], np.float32) * (1 - img)  # cold, slightly lifted shadows
    return np.clip(img, 0, 1)


def camera(img, t, dur, move, rng_phase, handheld=True):
    """Zoom/drift/shake by cropping; returns uint8 image."""
    k = t / max(dur, 1e-6)
    z, dx, dy = 1.0, 0.0, 0.0
    if move == "push":
        z = 1.0 + 0.09 * k
    elif move == "pull":
        z = 1.09 - 0.09 * k
    elif move == "drift":
        z, dx = 1.06, -25 + 50 * k
    elif move == "punch":
        z = 1.18 - 0.1 * min(1.0, t / 0.15)
    if handheld:
        dx += 6 * math.sin(1.3 * t + rng_phase) + 3 * math.sin(3.1 * t + 2 * rng_phase)
        dy += 5 * math.sin(1.1 * t + 3 * rng_phase) + 3 * math.sin(2.7 * t + rng_phase)
        z = max(z, 1.02)
    if move in ("shake", "punch"):
        amp = 28 * max(0.0, 1 - t / 0.6) if move == "shake" else 22
        dx += amp * math.sin(47 * t)
        dy += amp * math.sin(61 * t + 1)
        z = max(z, 1.05)
    im = Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8))
    cw, ch = W / z, H / z
    x0 = (W - cw) / 2 + dx
    y0 = (H - ch) / 2 + dy
    x0, y0 = min(max(0, x0), W - cw), min(max(0, y0), H - ch)
    return im.transform((W, H), Image.EXTENT, (x0, y0, x0 + cw, y0 + ch), Image.BILINEAR)


class Composer:
    """Draws frame i of the episode; frames are independent, so single stills can be checked quickly."""

    def __init__(self, ep, beats, shots):
        self.ep, self.beats, self.shots = ep, beats, shots
        grain = [np.random.default_rng(i).normal(0, 1, (H // 2, W // 2)) for i in range(6)]
        self.grain = [np.asarray(Image.fromarray(((g * 0.15 + 0.5).clip(0, 1) * 255).astype(np.uint8)).resize((W, H)),
                                 np.float32)[..., None] / 255 - 0.5 for g in grain]
        self.clock0 = sum(int(v) * m for v, m in zip(ep["clock"].split(":"), (3600, 60, 1)))
        self.subs = [(b.start + s0, b.start + s1, text, line.whisper) for b in beats for line in b.lines
                     if b.spec["shot"] != "__choice__" for s0, s1, text in subtitle_chunks(line)]
        self._choice_bg = None

    def choice_bg(self):
        """The last normal shot before the scare, without subtitles, behind the choice."""
        if self._choice_bg is None:
            idx = next((k for k, b in enumerate(self.beats) if b.spec.get("scare")), len(self.beats) - 1)
            b = next(x for x in reversed(self.beats[:idx]) if x.spec["shot"] != "black")
            self._choice_bg = self.picture(b, b.dur - 1 / FPS, b.start + b.dur - 1 / FPS, overlays=False)
        return self._choice_bg

    def frame(self, i):
        t = i / FPS
        b = next(x for x in reversed(self.beats) if x.start <= t + 1e-9)
        lt = t - b.start
        if b.spec.get("card"):
            alpha = min(1.0, lt / 0.15, max(0.0, (b.dur - lt) / 0.15))
            return finish(ui.card(b.spec["card"], alpha), self.grain[i % 6], 0.03)
        if b.spec["shot"] == "__choice__":
            c = self.ep["choice"]
            return finish(ui.choice_screen(self.choice_bg(), c["A"], c["B"], c["footer"], lt), self.grain[i % 6], 0.02)
        cctv_shot = self.ep["shots"][self.shot_name(b, lt)].get("grade") in ("cctv", "ir")
        return finish(self.picture(b, lt, t), self.grain[i % 6], 0.075 if cctv_shot else 0.04)

    @staticmethod
    def shot_name(b, lt):
        name = b.spec["shot"]
        for sw in b.spec.get("switch", []):
            if lt >= sw["at"]:
                name = sw["shot"]
        return name

    def picture(self, b, lt, t, overlays=True):
        spec, ep, shots = b.spec, self.ep, self.shots
        name = self.shot_name(b, lt)
        sspec = ep["shots"][name]
        files = shots.files.get(name, [None])
        if sspec.get("anim"):
            k = 1.0 if spec.get("frame") == "last" else min(1.0, lt / max(0.1, spec.get("anim_dur", b.dur)))
            pos = k * (len(files) - 1)
            a, frac = int(pos), pos - int(pos)
            img = shots.frame(name, a) * (1 - frac) + shots.frame(name, min(a + 1, len(files) - 1)) * frac
        else:
            img = shots.frame(name)
        bright = 1.0
        if spec.get("flicker"):
            bright *= 0.75 + 0.25 * (math.sin(t * 37) > -0.6) * (0.85 + 0.15 * math.sin(t * 91))
        if lt < spec.get("fade_in", 0.0):
            bright *= lt / spec["fade_in"]
        if spec.get("fade_out") and b.dur - lt < spec["fade_out"]:
            bright *= max(0.0, (b.dur - lt) / spec["fade_out"])
        cctv_shot = sspec.get("grade") in ("cctv", "ir")
        moving = cctv_shot or bool(sspec.get("anim"))
        move = "punch" if spec.get("scare") else spec.get("move", "static" if moving else "push")
        im = camera(img * bright, lt, b.dur, move, (sum(map(ord, name)) % 100) / 10, handheld=not cctv_shot)
        if spec.get("scare") and lt < 2 / FPS:
            im = Image.new("RGB", (W, H), (255, 255, 255))
        layer = ui.blank()
        if cctv_shot and overlays:
            stamp = sspec.get("clip") or fmt_clock(self.clock0 + t)
            ui.cctv(layer, sspec.get("label", "HALLWAY"), stamp, live=not sspec.get("clip"), blink=int(t * 2) % 2 == 0)
        if overlays and not spec.get("scare") and name != "black":
            ui.hud(layer, fmt_clock(self.clock0 + t), ep["battery"], f"PART {ep['part']}")
        if overlays and spec.get("title"):
            alpha = min(1.0, lt / 0.2) * min(1.0, max(0.0, (2.4 - lt) / 0.4))
            if alpha > 0:
                ui.title_card(layer, spec["title"][0], spec["title"][1], alpha)
        if overlays:
            for s0, s1, text, whisper in self.subs:
                if s0 <= t < s1:
                    layer.alpha_composite(ui.subtitle(text, whisper))
        im = im.convert("RGBA")
        im.alpha_composite(layer)
        return im.convert("RGB")


def finish(im, grain, amount):
    a = np.asarray(im, np.float32) / 255 + grain * amount
    return (np.clip(a, 0, 1) * 255).astype(np.uint8)


def fmt_clock(seconds):
    s = int(seconds) % 86400
    h, m, sec = s // 3600, s % 3600 // 60, s % 60
    hh = h % 12 or 12
    return f"{hh}:{m:02d}:{sec:02d} {'AM' if h < 12 else 'PM'}"


# ---------------------------------------------------------------- main

def make(path: Path, preview: bool, renders_only: bool, stills=None) -> Path | None:
    ep = json.loads(path.read_text(encoding="utf-8"))
    ep["shots"]["black"] = {"cam": None}
    jobs, files = plan_renders(ep, preview)
    run_blender(jobs)
    if renders_only:
        return None
    beats = build_timeline(ep)
    total = beats[-1].start + beats[-1].dur
    print(f"{ep['id']}: {total:.1f} s, {len(beats)} Abschnitte", flush=True)
    audio = build_audio(ep, beats, total)
    OUT.mkdir(parents=True, exist_ok=True)
    stem = f"person-detected-{ep['id']}" + ("-preview" if preview else "")
    wav = DATA / f"{stem}.wav"
    sound.write_wav(wav, audio)
    out = OUT / f"{stem}.mp4"
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
           "-r", str(FPS), "-i", "-", "-i", str(wav), "-af", "loudnorm=I=-14:TP=-1.5:LRA=11", "-vf", "setsar=1",
           "-aspect", "9:16",
           "-c:v", "libx264", "-preset", "medium", "-crf", "22", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k",
           "-ar", "48000", "-t", f"{total:.3f}", "-movflags", "+faststart", str(out)]
    shots = Shots(ep, files)
    comp = Composer(ep, beats, shots)
    if stills:
        if stills == "auto":   # one frame per beat, the scare's flash skipped, and the choice
            stills = [round(b.start + (0.1 if b.spec.get("scare") else b.dur * 0.6), 2) for b in beats[:-1]]
            stills.append(round(beats[-1].start + 3.0, 2))
        thumbs = [Image.fromarray(comp.frame(int(t * FPS))).resize((270, 480)) for t in stills]
        cols = 8
        sheet = Image.new("RGB", (270 * cols, 480 * (-(-len(thumbs) // cols))), "white")
        for k, im in enumerate(thumbs):
            sheet.paste(im, ((k % cols) * 270, (k // cols) * 480))
        out = DATA / "stills" / f"{stem}.jpg"
        out.parent.mkdir(parents=True, exist_ok=True)
        sheet.save(out, quality=85)
        return out
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    cover_at = ep.get("cover_at", 2.0)
    for i in range(int(round(total * FPS))):
        frame = comp.frame(i)
        if i == int(cover_at * FPS) and not preview:
            Image.fromarray(frame).save(OUT / f"{stem}-cover.png")
        proc.stdin.write(frame.tobytes())
    proc.stdin.close()
    if proc.wait():
        raise SystemExit("ffmpeg ist fehlgeschlagen")
    (OUT / f"{stem}-caption.txt").write_text(f"{ep['caption']}\n\n{' '.join(ep['hashtags'])}\n", encoding="utf-8")
    return out


def main():
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("episodes", nargs="+", type=Path)
    p.add_argument("--preview", action="store_true")
    p.add_argument("--renders-only", action="store_true")
    p.add_argument("--stills", help="only save frames at these seconds, e.g. 1,4.5,10 (or 'auto')")
    args = p.parse_args()
    for path in args.episodes:
        stills = None
        if args.stills:
            stills = "auto" if args.stills == "auto" else [float(x) for x in args.stills.split(",")]
        out = make(path, args.preview, args.renders_only, stills)
        if out:
            print(out)


if __name__ == "__main__":
    main()
