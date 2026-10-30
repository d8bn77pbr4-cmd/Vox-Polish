"""Render short vertical text videos (1080x1920, 30 fps) for TikTok from a JSON script.

Needs only Pillow and ffmpeg. The video is silent on purpose: add a trending sound or TikTok's own
voice in the app, which also helps reach. Text stays inside TikTok's safe area (right-hand buttons,
bottom caption).

    python3 tiktok/render.py tiktok/scripts/prompt-formel.json

Script format (see tiktok/scripts/): title, accent, handle, caption, hashtags and a list of slides of
type hook, tip, prompt or cta. Wrap words in *stars* to highlight them in the accent colour."""

from __future__ import annotations

import argparse
import json
import subprocess
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFont, ImageOps

W, H, FPS = 1080, 1920, 30
SAFE_L, SAFE_R, SAFE_T, SAFE_B = 72, 170, 260, 520
AREA_W = W - SAFE_L - SAFE_R
FADE_IN, FADE_OUT = 0.35, 0.2
TYPE_CPS = 26  # characters per second for the typed prompt
FONT_DIR = Path("/usr/share/fonts/truetype/dejavu")
WHITE, MUTED = (255, 255, 255), (190, 196, 210)


@lru_cache(maxsize=None)
def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONT_DIR / name), size)


def fit(name: str, size: int, text: str, width: int = AREA_W) -> ImageFont.FreeTypeFont:
    """The largest font up to `size` in which every single word still fits the safe width."""
    words = [w for w, _ in words_of(text)] or [" "]
    while size > 36 and max(font(name, size).getlength(w) for w in words) > width:
        size -= 4
    return font(name, size)


def hex_rgb(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))


def ease_out(t: float) -> float:
    t = min(1.0, max(0.0, t))
    return 1 - (1 - t) ** 3


def words_of(text: str) -> list[tuple[str, bool]]:
    """'a *b c* d' -> [('a', False), ('b', True), ('c', True), ('d', False)]"""
    out = []
    for i, part in enumerate(text.split("*")):
        out += [(w, i % 2 == 1) for w in part.split()]
    return out


def wrap(words: list[tuple[str, bool]], f: ImageFont.FreeTypeFont, width: int) -> list[list[tuple[str, bool]]]:
    lines: list[list[tuple[str, bool]]] = []
    line: list[tuple[str, bool]] = []
    used, space = 0.0, f.getlength(" ")
    for word in words:
        w = f.getlength(word[0])
        if line and used + space + w > width:
            lines.append(line)
            line, used = [], 0.0
        used += (space if line else 0) + w
        line.append(word)
    return lines + [line] if line else lines


def draw_lines(d: ImageDraw.ImageDraw, lines, f, y: float, accent, *, align="center", gap=1.25,
               color=WHITE) -> float:
    """Draw wrapped lines inside the safe area; returns the y below the block."""
    height = f.size * gap
    space = f.getlength(" ")
    for line in lines:
        total = sum(f.getlength(w) for w, _ in line) + space * (len(line) - 1)
        x = SAFE_L + (AREA_W - total) / 2 if align == "center" else SAFE_L
        for word, hi in line:
            d.text((x, y), word, font=f, fill=accent if hi else color)
            x += f.getlength(word) + space
        y += height
    return y


def block_height(lines, f, gap=1.25) -> float:
    return len(lines) * f.size * gap


@dataclass
class Slide:
    kind: str
    spec: dict
    accent: tuple[int, int, int]
    duration: float = 0.0

    def __post_init__(self):
        n = len(self.spec.get("text", "").split()) + len(self.spec.get("title", "").split())
        if self.kind == "hook":
            self.duration = min(3.4, max(2.4, 1.2 + 0.3 * n))
        elif self.kind == "tip":
            self.duration = min(7.0, max(3.2, 1.6 + 0.32 * n))
        elif self.kind == "prompt":
            self.duration = len(self.spec["text"]) / TYPE_CPS + 2.4
        else:
            self.duration = 3.0

    def draw(self, d: ImageDraw.ImageDraw, t: float, dy: float) -> None:
        a, s = self.accent, self.spec
        bold, regular, mono = "DejaVuSans-Bold.ttf", "DejaVuSans.ttf", "DejaVuSansMono.ttf"
        if self.kind == "hook":
            f = fit(bold, 108, s["text"])
            lines = wrap(words_of(s["text"]), f, AREA_W)
            top = SAFE_T + (H - SAFE_T - SAFE_B - block_height(lines, f, 1.2)) / 2
            y = draw_lines(d, lines, f, top + dy, a, gap=1.2)
            d.rounded_rectangle((SAFE_L + AREA_W / 2 - 90, y + 20, SAFE_L + AREA_W / 2 + 90, y + 32), 6, fill=a)
        elif self.kind == "tip":
            ft, fb = fit(bold, 82, s["title"]), fit(regular, 58, s["text"])
            title, body = wrap(words_of(s["title"]), ft, AREA_W), wrap(words_of(s["text"]), fb, AREA_W)
            total = 160 + block_height(title, ft, 1.2) + 30 + block_height(body, fb, 1.35)
            y = SAFE_T + 60 + (H - SAFE_T - SAFE_B - 60 - total) / 2 + dy
            cx = SAFE_L + AREA_W / 2
            d.ellipse((cx - 60, y, cx + 60, y + 120), fill=a)
            d.text((cx, y + 60), str(s["number"]), font=font(bold, 70), fill=(20, 20, 30), anchor="mm")
            y = draw_lines(d, title, ft, y + 160, a, gap=1.2)
            draw_lines(d, body, fb, y + 30, a, gap=1.35, color=MUTED)
        elif self.kind == "prompt":
            fm = fit(mono, 50, s["text"], AREA_W - 90)
            full = wrap(words_of(s["text"]), fm, AREA_W - 90)
            shown = int(max(0.0, t - FADE_IN) * TYPE_CPS)
            panel_h = 150 + block_height(full, fm, 1.4)
            top = SAFE_T + 60 + (H - SAFE_T - SAFE_B - 60 - panel_h - 90) / 2 + dy
            d.text((SAFE_L + AREA_W / 2, top), s.get("label", "Frag die KI:").upper(), font=font(bold, 44), fill=a,
                   anchor="mt")
            y0 = top + 90
            d.rounded_rectangle((SAFE_L, y0, SAFE_L + AREA_W, y0 + panel_h), 36, fill=(255, 255, 255, 26),
                                outline=a, width=4)
            y, count = y0 + 60, 0
            cursor = (SAFE_L + 45, y)
            for line in full:
                x = SAFE_L + 45
                for word, hi in line:
                    visible = word[:max(0, shown - count)]
                    if visible:
                        d.text((x, y), visible, font=fm, fill=a if hi else WHITE)
                        cursor = (x + fm.getlength(visible), y)
                    count += len(word) + 1
                    x += fm.getlength(word + " ")
                y += fm.size * 1.4
            if int(t * 3) % 2 == 0:  # blinking cursor after the last typed character
                d.rectangle((cursor[0] + 4, cursor[1] + 4, cursor[0] + 20, cursor[1] + 46), fill=a)
        else:  # cta
            f = fit(bold, 96, s["text"])
            lines = wrap(words_of(s["text"]), f, AREA_W)
            top = SAFE_T + (H - SAFE_T - SAFE_B - block_height(lines, f, 1.2)) / 2 - 40
            y = draw_lines(d, lines, f, top + dy, a, gap=1.2)
            if s.get("sub"):
                fb = fit(regular, 58, s["sub"])
                draw_lines(d, wrap(words_of(s["sub"]), fb, AREA_W), fb, y + 30, a, gap=1.35, color=MUTED)


def background(c1, c2) -> Image.Image:
    grad = Image.linear_gradient("L").resize((W, H))
    return ImageOps.colorize(grad, black=c1, white=c2).convert("RGB")


def frames(script: dict):
    accent = hex_rgb(script.get("accent", "#FFD23F"))
    bg = background(hex_rgb(script.get("bg_top", "#12131f")), hex_rgb(script.get("bg_bottom", "#2a1b3d")))
    slides = [Slide(s["type"], s, accent) for s in script["slides"]]
    total = sum(s.duration for s in slides)
    handle_font = font("DejaVuSans-Bold.ttf", 36)
    start = 0.0
    for index, slide in enumerate(slides):
        n = round(slide.duration * FPS)
        for k in range(n):
            t = k / FPS
            fade_in = ease_out(t / FADE_IN)
            fade_out = 1.0 if index == len(slides) - 1 else min(1.0, (slide.duration - t) / FADE_OUT)
            alpha = min(fade_in, fade_out)
            layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            slide.draw(ImageDraw.Draw(layer), t, 40 * (1 - fade_in))
            if alpha < 1:
                layer.putalpha(layer.getchannel("A").point(lambda v, al=alpha: int(v * al)))
            frame = bg.copy()
            frame.paste(layer, (0, 0), layer)
            d = ImageDraw.Draw(frame)
            progress = (start + t) / total
            d.rounded_rectangle((SAFE_L, 176, W - SAFE_R, 186), 5, fill=(70, 72, 92))
            d.rounded_rectangle((SAFE_L, 176, SAFE_L + AREA_W * progress, 186), 5, fill=accent)
            if script.get("handle"):
                d.text((SAFE_L, H - SAFE_B + 30), script["handle"], font=handle_font, fill=MUTED)
            yield frame
        start += slide.duration


def render(script_path: Path, out_dir: Path) -> Path:
    script = json.loads(script_path.read_text(encoding="utf-8"))
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / f"{script_path.stem}.mp4"
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
           "-r", str(FPS), "-i", "-", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-shortest",
           "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac",
           "-b:a", "64k", "-movflags", "+faststart", str(out)]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    cover = None
    for i, frame in enumerate(frames(script)):
        if i == FPS:  # one second in: the hook is fully visible
            cover = frame
        proc.stdin.write(frame.tobytes())
    proc.stdin.close()
    if proc.wait():
        raise SystemExit("ffmpeg ist fehlgeschlagen")
    if cover:
        cover.save(out_dir / f"{script_path.stem}-cover.png")
    caption = f"{script.get('caption', '')}\n\n{' '.join(script.get('hashtags', []))}\n"
    (out_dir / f"{script_path.stem}-caption.txt").write_text(caption, encoding="utf-8")
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("scripts", nargs="+", type=Path)
    parser.add_argument("--out", type=Path, default=Path(__file__).parent / "videos")
    args = parser.parse_args()
    for path in args.scripts:
        print(render(path, args.out))


if __name__ == "__main__":
    main()
