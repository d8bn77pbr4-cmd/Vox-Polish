"""Indicators professional day traders use, computed once per market and cached.

Every value at index i uses only bars up to and including i."""

from __future__ import annotations

import math
from collections import deque
from typing import TYPE_CHECKING

from .data import BARS_PER_DAY

if TYPE_CHECKING:
    from .strategy import Market

NAN = math.nan


def _cached(market: Market, key: tuple, compute) -> list[float]:
    if key not in market.cache:
        market.cache[key] = compute()
    return market.cache[key]


def atr(market: Market, symbol: str, n: int = 14) -> list[float]:
    """Average true range, Wilder smoothing."""
    def compute():
        h, lo, c = market.high[symbol], market.low[symbol], market.close[symbol]
        out, value = [NAN] * market.n, None
        for i in range(market.n):
            tr = h[i] - lo[i] if i == 0 else max(h[i] - lo[i], abs(h[i] - c[i - 1]), abs(lo[i] - c[i - 1]))
            value = tr if value is None else value + (tr - value) / n
            if i >= n:
                out[i] = value
        return out
    return _cached(market, ("atr", symbol, n), compute)


def ema(market: Market, symbol: str, n: int) -> list[float]:
    def compute():
        c, out, value, alpha = market.close[symbol], [NAN] * market.n, None, 2 / (n + 1)
        for i, x in enumerate(c):
            value = x if value is None else value + alpha * (x - value)
            if i >= n:
                out[i] = value
        return out
    return _cached(market, ("ema", symbol, n), compute)


def vwap(market: Market, symbol: str, anchor_hour: int = 0) -> list[float]:
    """Volume-weighted average price since the last session start (anchor_hour UTC)."""
    def compute():
        h, lo, c, v = market.high[symbol], market.low[symbol], market.close[symbol], market.volume[symbol]
        start = anchor_hour * 4
        out, pv, vol = [NAN] * market.n, 0.0, 0.0
        for i in range(market.n):
            if i % BARS_PER_DAY == start:
                pv = vol = 0.0
            typical = (h[i] + lo[i] + c[i]) / 3
            pv += typical * v[i]
            vol += v[i]
            out[i] = pv / vol if vol > 0 else c[i]
        return out
    return _cached(market, ("vwap", symbol, anchor_hour), compute)


def efficiency(market: Market, symbol: str, n: int) -> list[float]:
    """Kaufman efficiency ratio: 1 = straight trend, near 0 = choppy range."""
    def compute():
        c, out = market.close[symbol], [NAN] * market.n
        path = 0.0
        moves = [0.0] + [abs(c[i] - c[i - 1]) for i in range(1, market.n)]
        for i in range(market.n):
            path += moves[i]
            if i > n:
                path -= moves[i - n]
            if i >= n and path > 0:
                out[i] = abs(c[i] - c[i - n]) / path
        return out
    return _cached(market, ("er", symbol, n), compute)


def relative_volume(market: Market, symbol: str, days: int = 20) -> list[float]:
    """Volume of a bar compared with the average of the same time of day over the previous days."""
    def compute():
        v, out = market.volume[symbol], [NAN] * market.n
        for i in range(days * BARS_PER_DAY, market.n):
            past = [v[i - d * BARS_PER_DAY] for d in range(1, days + 1)]
            avg = sum(past) / days
            out[i] = v[i] / avg if avg > 0 else NAN
        return out
    return _cached(market, ("rvol", symbol, days), compute)


def bandwidth_squeeze(market: Market, symbol: str, n: int) -> list[float]:
    """Bollinger bandwidth now divided by its lowest value of the last day: near 1 means a squeeze."""
    def compute():
        _, sd = market.stats(symbol, n)
        c = market.close[symbol]
        width = [sd[i] / c[i] if sd[i] == sd[i] else math.inf for i in range(market.n)]
        out, lows = [NAN] * market.n, deque()  # indices of a rising sequence of widths: sliding minimum
        for i in range(market.n):
            if i >= BARS_PER_DAY and lows and width[i] < math.inf and width[lows[0]] > 0:
                out[i] = width[i] / width[lows[0]]
            while lows and width[lows[-1]] >= width[i]:
                lows.pop()
            lows.append(i)
            if lows[0] <= i - BARS_PER_DAY:
                lows.popleft()
        return out
    return _cached(market, ("squeeze", symbol, n), compute)
