"""2D layers drawn with Pillow: phone screens (used as textures in 3D), HUD, subtitles, camera overlays, choice."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1080, 1920
SAFE_L, SAFE_R, SAFE_T, SAFE_B = 72, 170, 260, 520
ROOT = Path(__file__).resolve().parents[2]
ANTON = ROOT / "tiktok" / "fonts" / "Anton-Regular.ttf"
DEJAVU = Path("/usr/share/fonts/truetype/dejavu")
RED = (255, 59, 59)
WHISPER = (255, 120, 120)


@lru_cache(maxsize=None)
def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    path = ANTON if name == "anton" else DEJAVU / name
    return ImageFont.truetype(str(path), size)


# ---------------------------------------------------------------- phone screens (texture 585 x 1266)

def phone_screen(spec: dict, out: Path) -> Path:
    """spec: {"time": "3:12", "battery": 23, "date": "Saturday, November 1", "cards": [{app, when, title, body}]}"""
    s = 2  # draw at 2x and scale down for crisp text
    w, h = 585 * s, 1266 * s
    im = Image.new("RGB", (w, h))
    top, bottom = (14, 18, 34), (4, 5, 10)
    for y in range(h):
        k = y / h
        im.paste(tuple(int(top[i] * (1 - k) + bottom[i] * k) for i in range(3)), (0, y, w, y + 1))
    d = ImageDraw.Draw(im, "RGBA")
    battery = spec.get("battery", 23)
    bx, by = w - 150 * s, 44 * s
    d.rounded_rectangle((bx, by, bx + 62 * s, by + 30 * s), 8 * s, outline=(255, 255, 255, 170), width=3 * s)
    d.rectangle((bx + 64 * s, by + 9 * s, bx + 69 * s, by + 21 * s), fill=(255, 255, 255, 170))
    fill = RED if battery <= 20 else (255, 255, 255)
    d.rounded_rectangle((bx + 5 * s, by + 5 * s, bx + 5 * s + int(52 * s * battery / 100), by + 25 * s), 4 * s, fill=fill)
    d.text((bx - 12 * s, by + 15 * s), f"{battery}%", font=font("DejaVuSans-Bold.ttf", 26 * s), fill="white", anchor="rm")
    d.text((w / 2, 230 * s), spec.get("date", "Saturday, November 1"), font=font("DejaVuSans-Bold.ttf", 34 * s),
           fill=(255, 255, 255, 220), anchor="mm")
    d.text((w / 2, 380 * s), spec.get("time", "3:12"), font=font("DejaVuSans-Bold.ttf", 190 * s), fill="white",
           anchor="mm")
    y = 560 * s
    for card in spec.get("cards", []):
        y = notification(d, card, y, w, s) + 22 * s
    return save_scaled(im, out)


def notification(d, card, y, w, s):
    x0, x1 = 34 * s, w - 34 * s
    body = card.get("body", "")
    lines = wrap_text(body, font("DejaVuSans.ttf", 44 * s), x1 - x0 - 130 * s)
    hgt = (176 + 54 * max(0, len(lines) - 1)) * s
    d.rounded_rectangle((x0, y, x1, y + hgt), 38 * s, fill=(235, 235, 240, 235))
    ic = (x0 + 30 * s, y + 30 * s)
    color = (210, 40, 40) if card.get("app") == "HOMECAM" else (52, 199, 89)
    d.rounded_rectangle((ic[0], ic[1], ic[0] + 52 * s, ic[1] + 52 * s), 14 * s, fill=color)
    if card.get("app") == "HOMECAM":
        d.ellipse((ic[0] + 13 * s, ic[1] + 13 * s, ic[0] + 39 * s, ic[1] + 39 * s), outline="white", width=5 * s)
    else:
        d.ellipse((ic[0] + 10 * s, ic[1] + 12 * s, ic[0] + 42 * s, ic[1] + 38 * s), fill="white")
    d.text((ic[0] + 70 * s, ic[1] + 4 * s), card["app"], font=font("DejaVuSans.ttf", 26 * s), fill=(90, 90, 96))
    d.text((x1 - 30 * s, ic[1] + 4 * s), card.get("when", "now"), font=font("DejaVuSans.ttf", 26 * s),
           fill=(110, 110, 116), anchor="ra")
    d.text((ic[0] + 70 * s, ic[1] + 38 * s), card["title"], font=font("DejaVuSans-Bold.ttf", 46 * s), fill=(15, 15, 18))
    ty = ic[1] + 94 * s
    for line in lines:
        d.text((ic[0] + 70 * s, ty), line, font=font("DejaVuSans.ttf", 44 * s), fill=(30, 30, 34))
        ty += 54 * s
    return y + hgt


def wrap_text(text, f, width):
    lines, line = [], ""
    for word in text.split():
        test = f"{line} {word}".strip()
        if f.getlength(test) > width and line:
            lines.append(line)
            line = word
        else:
            line = test
    return lines + [line] if line else lines


def save_scaled(im, out: Path) -> Path:
    out.parent.mkdir(parents=True, exist_ok=True)
    im.resize((585, 1266), Image.LANCZOS).save(out)
    return out


# ---------------------------------------------------------------- overlays on the video (RGBA, full frame)

def blank():
    return Image.new("RGBA", (W, H), (0, 0, 0, 0))


def hud(layer, clock: str, battery: int, part: str):
    """Counter top left: the clock ticking and your battery."""
    d = ImageDraw.Draw(layer)
    x, y = SAFE_L, SAFE_T + 10
    f = font("anton", 54)
    d.text((x, y), clock, font=f, fill="white", stroke_width=4, stroke_fill=(0, 0, 0))
    bx = x + f.getlength(clock) + 34
    color = RED if battery <= 20 else (255, 255, 255)
    d.rounded_rectangle((bx, y + 14, bx + 78, y + 52), 9, outline="white", width=4)
    d.rectangle((bx + 80, y + 25, bx + 86, y + 41), fill="white")
    d.rounded_rectangle((bx + 7, y + 21, bx + 7 + max(4, int(64 * battery / 100)), y + 45), 4, fill=color)
    d.text((bx + 100, y), f"{battery}%", font=f, fill=color, stroke_width=4, stroke_fill=(0, 0, 0))
    if part:
        d.text((x, y + 74), part, font=font("anton", 40), fill=(220, 220, 220), stroke_width=3, stroke_fill=(0, 0, 0))


@lru_cache(maxsize=256)
def subtitle(text: str, whisper: bool) -> Image.Image:
    """Big centred words; *word* in red. Whispers in pale red, in quotes."""
    layer = blank()
    d = ImageDraw.Draw(layer)
    size = 84 if whisper else 100
    f = font("anton", size)
    words = []
    for i, part in enumerate(text.split("*")):
        words += [(w.upper() if not whisper else w, i % 2 == 1) for w in part.split()]
    if whisper:
        words = [(f"“{words[0][0]}", words[0][1])] + words[1:-1] + [(f"{words[-1][0]}”", words[-1][1])] \
            if len(words) > 1 else [(f"“{words[0][0]}”", words[0][1])]
    area = W - SAFE_L - SAFE_R
    lines, line, used = [], [], 0.0
    for word in words:
        wlen = f.getlength(word[0])
        if line and used + f.getlength(" ") + wlen > area:
            lines.append(line)
            line, used = [], 0.0
        used += (f.getlength(" ") if line else 0) + wlen
        line.append(word)
    lines.append(line)
    y = 1130 - len(lines) * size * 0.6
    for line in lines:
        total = sum(f.getlength(w) for w, _ in line) + f.getlength(" ") * (len(line) - 1)
        x = SAFE_L + (area - total) / 2
        for w, hi in line:
            color = RED if hi else (WHISPER if whisper else (255, 255, 255))
            d.text((x, y), w, font=f, fill=color, stroke_width=8, stroke_fill=(0, 0, 0))
            x += f.getlength(w + " ")
        y += size * 1.18
    return layer


def cctv(layer, label: str, stamp: str, live: bool, blink: bool):
    d = ImageDraw.Draw(layer)
    f = font("DejaVuSansMono-Bold.ttf", 38)
    y = SAFE_T + 150
    d.text((SAFE_L, y), f"CAM 01  {label}", font=f, fill=(235, 235, 235), stroke_width=2, stroke_fill=(0, 0, 0))
    yb = H - SAFE_B - 70
    if live:
        if blink:
            d.ellipse((SAFE_L, yb + 8, SAFE_L + 30, yb + 38), fill=RED)
        d.text((SAFE_L + 44, yb), "LIVE", font=f, fill=(235, 235, 235), stroke_width=2, stroke_fill=(0, 0, 0))
    else:
        d.polygon([(SAFE_L, yb + 6), (SAFE_L, yb + 40), (SAFE_L + 28, yb + 23)], fill=(235, 235, 235))
        d.text((SAFE_L + 44, yb), "CLIP", font=f, fill=(235, 235, 235), stroke_width=2, stroke_fill=(0, 0, 0))
    d.text((SAFE_L + 170, yb), stamp, font=f, fill=(235, 235, 235), stroke_width=2, stroke_fill=(0, 0, 0))
    # corner brackets
    for cx, cy, sx, sy in ((40, 220, 1, 1), (W - 40, 220, -1, 1), (40, H - 420, 1, -1), (W - 40, H - 420, -1, -1)):
        d.line([(cx, cy + 60 * sy), (cx, cy), (cx + 60 * sx, cy)], fill=(230, 230, 230), width=5)


def title_card(layer, top: str, sub: str, alpha: float):
    d = ImageDraw.Draw(layer)
    a = int(255 * alpha)
    d.text((W / 2 - (SAFE_R - SAFE_L) / 2, 700), top, font=font("anton", 150), fill=(255, 255, 255, a), anchor="mm",
           stroke_width=8, stroke_fill=(0, 0, 0, a))
    d.text((W / 2 - (SAFE_R - SAFE_L) / 2, 830), sub, font=font("anton", 62), fill=(*RED, a), anchor="mm",
           stroke_width=5, stroke_fill=(0, 0, 0, a))


def choice_screen(bg: Image.Image, a: str, b: str, footer: str, t: float) -> Image.Image:
    """Blurred, darkened last shot with the two options; options slide in one after the other."""
    im = bg.filter(ImageFilter.GaussianBlur(18)).point(lambda v: int(v * 0.35)).convert("RGBA")
    d = ImageDraw.Draw(im)
    cx = SAFE_L + (W - SAFE_L - SAFE_R) / 2
    d.text((cx, 520), "WHAT WOULD YOU DO?", font=font("anton", 92), fill="white", anchor="mm",
           stroke_width=6, stroke_fill=(0, 0, 0))
    for i, (letter, text) in enumerate((("A", a), ("B", b))):
        k = max(0.0, min(1.0, (t - 0.25 - i * 0.6) / 0.35))
        if k <= 0:
            continue
        y = 680 + i * 280 + int((1 - k) * 60)
        box = (SAFE_L + 10, y, W - SAFE_R - 10, y + 230)
        d.rounded_rectangle(box, 28, fill=(10, 10, 14, int(220 * k)), outline=(*RED, int(255 * k)), width=6)
        d.text((box[0] + 40, y + 115), letter, font=font("anton", 150), fill=(*RED, int(255 * k)), anchor="lm")
        lines = wrap_text(text.upper(), font("anton", 64), box[2] - box[0] - 190)
        ly = y + 115 - (len(lines) - 1) * 38
        for line in lines:
            d.text((box[0] + 170, ly), line, font=font("anton", 64), fill=(255, 255, 255, int(255 * k)), anchor="lm")
            ly += 76
    if t > 1.6:
        d.text((cx, 1300), "COMMENT A OR B", font=font("anton", 80), fill="white", anchor="mm", stroke_width=6,
               stroke_fill=(0, 0, 0))
        d.text((cx, 1385), footer, font=font("anton", 46), fill=(200, 200, 200), anchor="mm", stroke_width=4,
               stroke_fill=(0, 0, 0))
    return im.convert("RGB")
