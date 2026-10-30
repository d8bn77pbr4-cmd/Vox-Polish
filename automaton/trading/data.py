"""Real 15-minute candles from Binance's public archive (data.binance.vision), cached on disk."""

from __future__ import annotations

import csv
import io
import urllib.error
import urllib.request
import zipfile
from pathlib import Path
from typing import Callable, NamedTuple

ARCHIVE = "https://data.binance.vision/data/spot/monthly/klines/{symbol}/{interval}/{symbol}-{interval}-{month}.zip"
SYMBOLS = ("BTCUSDT", "ETHUSDT", "SOLUSDT")
INTERVAL = "15m"
BARS_PER_DAY = 96
CACHE = Path("data/klines")


class Bar(NamedTuple):
    t: int  # open time, unix seconds
    open: float
    high: float
    low: float
    close: float
    volume: float = 0.0


def months(start: str, end: str) -> list[str]:
    """Inclusive list of 'YYYY-MM' months."""
    y, m = map(int, start.split("-"))
    ey, em = map(int, end.split("-"))
    out = []
    while (y, m) <= (ey, em):
        out.append(f"{y:04d}-{m:02d}")
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return out


def _path(cache: Path, symbol: str, month: str) -> Path:
    return cache / symbol / f"{symbol}-{INTERVAL}-{month}.csv"


def download(symbols=SYMBOLS, start: str = "2024-10", end: str = "2026-09", cache: Path = CACHE,
             log: Callable[[str], None] = print) -> None:
    for symbol in symbols:
        for month in months(start, end):
            target = _path(cache, symbol, month)
            if target.exists():
                continue
            url = ARCHIVE.format(symbol=symbol, interval=INTERVAL, month=month)
            try:
                with urllib.request.urlopen(url, timeout=60) as response:
                    archive = zipfile.ZipFile(io.BytesIO(response.read()))
            except urllib.error.HTTPError as e:
                log(f"{symbol} {month}: nicht verfügbar ({e.code})")
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(archive.read(archive.namelist()[0]))
            log(f"{symbol} {month}: geladen")


def load(symbol: str, start: str, end: str, cache: Path = CACHE) -> list[Bar]:
    bars = []
    for month in months(start, end):
        path = _path(cache, symbol, month)
        if not path.exists():
            raise FileNotFoundError(f"{path} fehlt. Erst 'automaton trade download' ausführen.")
        with path.open(newline="") as f:
            for row in csv.reader(f):
                if not row or not row[0].isdigit():
                    continue  # header line in some archives
                t = int(row[0])
                t = t // 1_000_000 if t > 10**14 else t // 1000  # microseconds since 2025, milliseconds before
                bars.append(Bar(t, float(row[1]), float(row[2]), float(row[3]), float(row[4]), float(row[5])))
    bars.sort(key=lambda b: b.t)
    return bars


def align(series: dict[str, list[Bar]]) -> dict[str, list[Bar]]:
    """Keep only whole UTC days that every symbol has completely, so all series share one clock."""
    def full_days(bars):
        count: dict[int, int] = {}
        for b in bars:
            count[b.t // 86400] = count.get(b.t // 86400, 0) + 1
        return {d for d, n in count.items() if n == BARS_PER_DAY}

    days = set.intersection(*(full_days(b) for b in series.values()))
    return {s: [b for b in bars if b.t // 86400 in days] for s, bars in series.items()}
