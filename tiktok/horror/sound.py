"""Voices (Kokoro, Apache 2.0, runs offline) and synthesized horror sounds, mixed with numpy/scipy."""

from __future__ import annotations

import hashlib
from functools import lru_cache
from pathlib import Path

import numpy as np
from scipy import signal

SR = 48000
ROOT = Path(__file__).resolve().parents[2]
KOKORO = ROOT / "data" / "kokoro"
CACHE = ROOT / "data" / "horror" / "tts"
NARRATOR = ("am_michael", 0.9)    # calm, low US male voice, unhurried
MOM = ("af_heart", 0.86)          # the best-rated Kokoro voice, turned into a whisper
RNG = np.random.default_rng(7)


# ---------------------------------------------------------------- voices

@lru_cache(maxsize=1)
def kokoro():
    from kokoro_onnx import Kokoro
    voices = KOKORO / "voices-horror.npz"
    if not voices.exists():
        names = [NARRATOR[0], MOM[0]]
        np.savez(voices, **{n: np.fromfile(KOKORO / f"{n}.bin", dtype=np.float32).reshape(510, 1, 256) for n in names})
    return Kokoro(str(KOKORO / "model.onnx"), str(voices))


def tts(text: str, voice: tuple[str, float]) -> np.ndarray:
    """Speech at 48 kHz, trimmed; cached on disk because synthesis takes a few seconds."""
    name, speed = voice
    key = hashlib.sha1(f"{name}|{speed}|{text}".encode()).hexdigest()[:16]
    path = CACHE / f"{key}.npy"
    if path.exists():
        return np.load(path)
    audio, sr = kokoro().create(text, voice=name, speed=speed, lang="en-us")
    audio = signal.resample_poly(np.asarray(audio, dtype=np.float64), SR, sr)
    loud = np.flatnonzero(np.abs(audio) > 0.01)
    if len(loud):
        audio = audio[max(0, loud[0] - 480):loud[-1] + 2400]
    audio = audio / (np.max(np.abs(audio)) + 1e-9) * 0.8
    CACHE.mkdir(parents=True, exist_ok=True)
    np.save(path, audio.astype(np.float32))
    return audio.astype(np.float32)


def narrator(text: str) -> np.ndarray:
    x = tts(text, NARRATOR)
    x = filt(x, "highpass", 70) + 0.18 * filt(x, "lowpass", 260)   # a little close-mic warmth
    return reverb(x, 0.35, 0.10)


def whisper(text: str) -> np.ndarray:
    """Mom's voice, but wrong: breathy, doubled a few milliseconds apart, in a small dark room."""
    x = filt(tts(text, MOM), "highpass", 250)
    env = filt(np.abs(x), "lowpass", 35)
    breath = filt(RNG.standard_normal(len(x)), "bandpass", (1500, 7500)) * env * 3.0
    double = np.concatenate([np.zeros(int(0.023 * SR)), x])[:len(x)] * 0.5
    y = 0.55 * x + double + breath
    return reverb(y, 0.9, 0.35) * 0.9


# ---------------------------------------------------------------- dsp helpers

def filt(x, kind, freq, order=4):
    sos = signal.butter(order, freq, btype=kind, fs=SR, output="sos")
    return signal.sosfilt(sos, x)


def reverb(x, seconds, wet):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    ir = RNG.standard_normal(n) * np.exp(-6.9 * t / seconds)
    ir = filt(ir, "lowpass", 5000) / np.sqrt(np.sum(ir ** 2))
    y = signal.fftconvolve(x, ir)[:len(x) + n]
    out = np.zeros(len(y))
    out[:len(x)] += x * (1 - wet)
    return out + y * wet


def env_adsr(n, attack, release):
    e = np.ones(n)
    a, r = min(n, int(attack * SR)), min(n, int(release * SR))
    if a:
        e[:a] = np.linspace(0, 1, a)
    if r:
        e[-r:] *= np.linspace(1, 0, r)
    return e


def add(*xs):
    """Sum signals of different lengths."""
    out = np.zeros(max(len(x) for x in xs))
    for x in xs:
        out[:len(x)] += x
    return out


def secs(d):
    return np.arange(int(d * SR)) / SR


def noise(d):
    return RNG.standard_normal(int(d * SR))


# ---------------------------------------------------------------- sound effects

def buzz(d=0.95):
    """Phone vibrating on a wooden nightstand: two pulses."""
    out = np.zeros(int(d * SR))
    for start in (0.0, 0.5):
        t = secs(0.36)
        tone = np.tanh(3 * np.sin(2 * np.pi * 172 * t)) * (0.7 + 0.3 * np.sin(2 * np.pi * 31 * t))
        rattle = filt(noise(0.36), "bandpass", (180, 900)) * 0.25
        seg = (tone + rattle) * env_adsr(len(t), 0.01, 0.04)
        i = int(start * SR)
        out[i:i + len(seg)] += seg[:len(out) - i]
    return filt(out, "bandpass", (90, 2500)) * 0.35


def chime():
    t = secs(1.2)
    x = sum(a * np.sin(2 * np.pi * f * t) * np.exp(-t * k) for f, a, k in ((1318.5, 0.5, 4), (1975.5, 0.3, 6)))
    x[int(0.11 * SR):] += 0.4 * np.sin(2 * np.pi * 1760 * t[:-int(0.11 * SR)]) * np.exp(-t[:-int(0.11 * SR)] * 5)
    return x * 0.22


def creak(d=1.1, base=420):
    """Old floorboard: irregular stick-slip pulses through wooden resonances."""
    out = np.zeros(int(d * SR))
    t, rate = 0.05, 35.0
    while t < d - 0.05:
        i = int(t * SR)
        out[i] += RNG.uniform(0.5, 1.0)
        rate = min(110.0, rate * RNG.uniform(1.0, 1.06))
        t += 1.0 / rate * RNG.uniform(0.7, 1.3)
    body = sum(filt(out, "bandpass", (f * 0.93, f * 1.07), order=2) * g for f, g in
               ((base, 1.0), (base * 2.1, 0.6), (base * 3.7, 0.35)))
    return body * env_adsr(len(out), 0.15, 0.3) * 6


def breath(d=2.4):
    x = filt(noise(d), "bandpass", (350, 2800))
    t = secs(d)
    e = np.clip(np.sin(np.pi * t / d * 2) ** 2, 0, 1) * 0.6
    return x * e * 0.18


def heartbeat(d, bpm=80):
    out = np.zeros(int(d * SR))
    for beat in np.arange(0, d - 0.4, 60 / bpm):
        for off, amp in ((0, 1.0), (0.24, 0.7)):
            t = secs(0.16)
            th = np.sin(2 * np.pi * (52 - 40 * t) * t) * np.exp(-t * 28) * amp
            i = int((beat + off) * SR)
            out[i:i + len(th)] += th[:len(out) - i]
    return filt(out, "lowpass", 160) * 0.5


def drone(d, level=1.0):
    t = secs(d)
    lfo = 0.6 + 0.4 * np.sin(2 * np.pi * 0.07 * t)
    low = (np.sin(2 * np.pi * 41 * t) + 0.6 * np.sin(2 * np.pi * 61.7 * t) + 0.4 * np.sin(2 * np.pi * 82.3 * t)) * lfo
    rumble = filt(noise(d), "lowpass", 140) * 1.6
    air = filt(noise(d), "bandpass", (2500, 6000)) * 0.03
    eerie = 0.05 * np.sin(2 * np.pi * (1180 + 6 * np.sin(2 * np.pi * 0.3 * t)) * t) * (0.5 + 0.5 * np.sin(2 * np.pi * 0.05 * t))
    return (low * 0.07 + rumble * 0.06 + air + eerie * 0.3) * level * env_adsr(len(t), 1.5, 1.0)


def room_tone(d):
    t = secs(d)
    hum = sum(a * np.sin(2 * np.pi * f * t) for f, a in ((50, 1), (100, 0.5), (150, 0.25)))
    return hum * 0.006 + filt(noise(d), "lowpass", 900) * 0.01


def click():
    t = secs(0.25)
    x = sum(np.sin(2 * np.pi * f * t) * np.exp(-t * k) for f, k in ((2350, 40), (3150, 55), (4450, 70)))
    x[:240] += noise(0.005) * 0.8
    return x * 0.25


def handle_squeak(d=2.6):
    t = secs(d)
    f = 1150 - 260 * (t / d) + 25 * np.sin(2 * np.pi * 7 * t)
    phase = 2 * np.pi * np.cumsum(f) / SR
    x = np.sin(phase) * (0.4 + 0.6 * np.abs(np.sin(2 * np.pi * 2.3 * t))) + 0.3 * np.sin(2 * phase)
    return filt(x, "bandpass", (600, 4000)) * env_adsr(len(t), 0.4, 0.4) * 0.07


def thud(gain=1.0):
    t = secs(0.6)
    x = np.sin(2 * np.pi * (75 - 30 * t) * t) * np.exp(-t * 9) + filt(noise(0.6), "lowpass", 700) * np.exp(-t * 18) * 0.6
    return x * 0.8 * gain


def light_off():
    return add(click() * 1.4, filt(noise(0.08), "highpass", 3000) * 0.05)


def riser(d=2.2):
    t = secs(d)
    x = filt(noise(d), "bandpass", (300, 4000)) * (t / d) ** 2 * 0.25
    tone = np.sin(2 * np.pi * np.cumsum(200 + 500 * (t / d) ** 2) / SR) * (t / d) ** 3 * 0.12
    return x + tone


def stinger(d=1.3):
    """The jump scare: a screeching cluster, a noise burst and a sub hit, all at once."""
    t = secs(d)
    cluster = sum(signal.sawtooth(2 * np.pi * np.cumsum(f * (1 + 0.35 * np.minimum(t, 0.25))) / SR)
                  for f in (523, 554, 587, 740, 1108, 1480))
    x = np.tanh(cluster * 0.6) * 0.5 + noise(d) * 0.5 * np.exp(-t * 6)
    sub = np.sin(2 * np.pi * (60 - 25 * t) * t) * np.exp(-t * 3) * 1.2
    return (filt(x, "highpass", 200) * np.exp(-t * 2.2) + sub) * env_adsr(len(t), 0.003, 0.4) * 0.9


# ---------------------------------------------------------------- music (follows the tension curve)

def pulse(d, bpm):
    """Low heart-like bass pulse."""
    out = np.zeros(int(d * SR))
    for beat in np.arange(0, d, 60 / bpm):
        t = secs(0.5)
        x = np.sin(2 * np.pi * (55 - 18 * t) * t) * np.exp(-t * 7) + filt(noise(0.5), "lowpass", 300) * np.exp(-t * 30) * 0.3
        i = int(beat * SR)
        out[i:i + len(x)] += x[:len(out) - i]
    return out * 0.35


def tick(d, offset=0.0):
    """Clock ticking on every full second (tick / tock)."""
    out = np.zeros(int(d * SR))
    for k, sec in enumerate(np.arange(1 - offset % 1, d, 1.0)):
        t = secs(0.05)
        f = 2900 if k % 2 == 0 else 2400
        x = np.sin(2 * np.pi * f * t) * np.exp(-t * 160) + noise(0.05) * np.exp(-t * 300) * 0.4
        i = int(sec * SR)
        out[i:i + len(x)] += x[:len(out) - i]
    return out * 0.11


def strings(d, rise=0.0):
    """Dissonant, slowly swelling string cluster; rise = semitones it slides up over its length."""
    t = secs(d)
    bend = 2 ** (rise * (t / d) / 12)
    x = sum(signal.sawtooth(2 * np.pi * np.cumsum(f * bend * (1 + 0.003 * np.sin(2 * np.pi * (0.2 + i * 0.07) * t))) / SR)
            for i, f in enumerate((110.0, 116.5, 164.8, 174.6, 233.1)))
    x = filt(x, "lowpass", 1400) * (0.55 + 0.45 * np.sin(2 * np.pi * 5.5 * t) ** 2)
    return x * 0.035 * env_adsr(len(t), min(2.0, d / 2), 0.3)


def shepard(d, octaves_per_s=0.22):
    """A tone that seems to rise forever."""
    t = secs(d)
    out = np.zeros(len(t))
    for k in range(7):
        pos = (k + octaves_per_s * t) % 7
        f = 40 * 2 ** pos
        amp = np.exp(-((pos - 3.5) ** 2) / 2.2)
        out += np.sin(2 * np.pi * np.cumsum(f) / SR) * amp
    return out * 0.05 * env_adsr(len(t), 0.8, 0.05)


def impact():
    t = secs(2.2)
    x = np.sin(2 * np.pi * (48 - 22 * t) * t) * np.exp(-t * 2.2) + filt(noise(2.2), "lowpass", 900) * np.exp(-t * 9) * 0.7
    return reverb(x, 1.6, 0.3) * 0.9


def reverse_swell(d=1.4):
    t = secs(d)
    x = filt(noise(d), "bandpass", (200, 6000)) * np.exp(-(d - t) * 4)
    tone = sum(np.sin(2 * np.pi * f * t) for f in (220, 233, 330)) * np.exp(-(d - t) * 3) * 0.2
    return (x * 0.35 + tone * 0.25) * env_adsr(len(t), 0.05, 0.01)


def ring(d=3.0):
    t = secs(d)
    return np.sin(2 * np.pi * 3800 * t) * np.exp(-t * 1.1) * 0.05


def whoosh(d=0.7):
    t = secs(d)
    x = noise(d)
    lo = filt(x, "bandpass", (300, 1200)) * np.sin(np.pi * t / d) ** 2
    hi = filt(x, "bandpass", (1500, 6000)) * np.sin(np.pi * np.clip(t / d * 1.2, 0, 1)) ** 4
    return (lo + hi * 0.6) * 0.4


def footstep():
    t = secs(0.25)
    return (filt(noise(0.25), "lowpass", 500) * np.exp(-t * 40) + np.sin(2 * np.pi * 70 * t) * np.exp(-t * 30)) * 0.5


def cloth(d=0.6):
    t = secs(d)
    return filt(noise(d), "bandpass", (800, 5000)) * np.sin(np.pi * t / d) ** 2 * 0.12


def music(label, d, t0=0.0):
    """One stretch of score; labels: drone, pulse60, pulse90, riser, silence, outro."""
    if label == "silence":
        return np.zeros(int(d * SR))
    if label == "drone":
        return drone(d, 0.9)
    if label == "outro":
        return drone(d, 0.5) + strings(d) * 0.5
    if label == "pulse60":
        return add(drone(d, 0.9), pulse(d, 60), tick(d, t0))
    if label == "pulse90":
        return add(drone(d, 1.0), pulse(d, 90), tick(d, t0), strings(d, rise=1.0))
    if label == "riser":
        return add(drone(d, 1.1), pulse(d, 120) * 1.2, shepard(d), strings(d, rise=3.0) * 1.4, tick(d, t0) * 0.8)
    raise ValueError(label)


SFX = {"buzz": buzz, "impact": impact, "swell": reverse_swell, "ring": ring, "whoosh": whoosh,
       "step": footstep, "cloth": cloth, "bed": lambda: creak(0.7, 250) * 0.6, "chime": chime, "creak": creak, "breath": breath, "click": click, "squeak": handle_squeak,
       "thud": thud, "slam": lambda: add(thud(1.6), creak(0.4, 300) * 0.5), "light_off": light_off, "riser": riser,
       "stinger": stinger, "creak_low": lambda: creak(1.4, 300)}


# ---------------------------------------------------------------- mixing

def place(out, start, x, gain=1.0, pan=0.0):
    """Add mono x to the stereo buffer at start seconds, panned -1 (left) .. 1 (right)."""
    i = int(start * SR)
    if i >= len(out):
        return
    x = np.asarray(x)[:len(out) - i] * gain
    out[i:i + len(x), 0] += x * np.sqrt((1 - pan) / 2) * 1.41
    out[i:i + len(x), 1] += x * np.sqrt((1 + pan) / 2) * 1.41


def mix(total, voice, sfx, score, silence=()):
    """voice/sfx: (start, samples, gain, pan); score: mono music bed. The score ducks under the voice and drops
    out completely in the silence ranges."""
    n = int(total * SR)
    out = np.zeros((n, 2))
    talk = np.zeros(n)
    for start, x, gain, pan in voice:
        place(out, start, x, gain, pan)
        i = int(start * SR)
        talk[i:i + len(x)] += np.abs(np.asarray(x)[:max(0, n - i)])
    duck = 1 - 0.55 * np.clip(filt(talk, "lowpass", 4) * 6, 0, 1)
    gate = np.ones(n)
    for a, b in silence:
        i, j = int(a * SR), min(n, int(b * SR))
        ramp = min(int(0.12 * SR), j - i)
        gate[i:i + ramp] = np.minimum(gate[i:i + ramp], np.linspace(1, 0, ramp))
        gate[i + ramp:j] = 0
    bed = np.zeros(n)
    bed[:min(n, len(score))] = score[:n]
    bed *= duck * gate
    out[:, 0] += bed
    out[:, 1] += np.concatenate([np.zeros(int(0.011 * SR)), bed])[:n]     # a little width
    for start, x, gain, pan in sfx:
        place(out, start, x, gain, pan)
    out = np.tanh(out * 1.1) / np.tanh(1.1)
    return out / (np.max(np.abs(out)) + 1e-9) * 0.89


def write_wav(path, x):
    import wave
    pcm = (np.clip(x, -1, 1) * 32767).astype("<i2")
    with wave.open(str(path), "wb") as w:
        w.setnchannels(x.shape[1] if x.ndim == 2 else 1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
