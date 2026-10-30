"""Professional day trader: a playbook of setups plus the risk and execution rules pros live by.

Setups (each a well-known intraday pattern):
- orb: opening-range breakout. Trade the break of the first bars of a session (Asia 00:00, London 08:00,
  New York 13:00/14:00 UTC).
- vwap_revert: fade stretched moves away from the session VWAP, in a ranging market.
- vwap_pullback: in a trend, buy the pullback to VWAP that closes strong (sell the rally in a downtrend).
- momentum: intraday momentum. A strong move in the first hours of the session continues into the close.
- squeeze: volatility contraction, then expansion. Trade the break out of a Bollinger squeeze.
- exhaustion: fade a climactic bar (huge range on high relative volume), e.g. a liquidation cascade.

Rules every trader follows:
- Risk a fixed share of capital per trade; position size = risk / stop distance (capped by leverage).
- Stop and target in units of ATR and R (risk) multiples; stop moves to break-even after a set gain.
- Trade only if the target is worth many times the round-trip cost.
- Limit-order (maker) entries if chosen: filled only if price trades through the limit.
- Daily stop after losing 3 R; two losses in a row mean a two-hour pause (no revenge trading).
- Optional filters: higher-timeframe trend (EMA 200 on 15m, about 50 hours), market regime
  (efficiency ratio), relative volume, no weekends.
- Flat at the end of every UTC day. No new trades in its last hour."""

from __future__ import annotations

import math
import random
from dataclasses import dataclass, field, replace
from datetime import datetime, timezone

from .data import BARS_PER_DAY, SYMBOLS
from .indicators import atr, bandwidth_squeeze, efficiency, ema, relative_volume, vwap
from .strategy import NO_ENTRY_BARS, Exam, Market

SETUPS = ("orb", "vwap_revert", "vwap_pullback", "momentum", "squeeze", "exhaustion")
MAKER_FEE = 0.0002
TAKER_FEE = 0.0005
SLIPPAGE = 0.0002  # on market orders: stops, day-end exits, market entries
MAX_LEVERAGE = 3.0
DAILY_STOP_R = 3.0
COOLDOWN_BARS = 8
MIN_TARGET_COST_RATIO = 6.0


@dataclass(frozen=True)
class ProGenome:
    symbol: str = "BTCUSDT"
    setup: str = "orb"
    session_hour: int = 13  # UTC hour the session starts
    window: int = 8  # bars: opening range, momentum window, regime and squeeze lookback
    entry_k: float = 1.0  # how strong the trigger must be (ATR or standard-deviation units)
    stop_atr: float = 1.0
    target_r: float = 2.0
    breakeven_r: float = 1.0  # 0 = never move the stop to break-even
    regime: str = "any"  # any | trend | range
    htf_filter: bool = True
    min_rvol: float = 0.0
    maker: bool = True
    allow_short: bool = True
    weekends: bool = True
    max_trades_per_day: int = 2
    risk: float = 0.005  # share of capital at risk per trade

    def label(self) -> str:
        names = {"orb": "Opening-Range-Breakout", "vwap_revert": "VWAP-Rückkehr", "vwap_pullback": "VWAP-Pullback",
                 "momentum": "Intraday-Momentum", "squeeze": "Squeeze-Ausbruch", "exhaustion": "Erschöpfungs-Fade"}
        return f"{self.symbol[:-4]} {names[self.setup]} ({self.session_hour}:00 UTC, {self.window} Kerzen)"


PRO_GENES: dict[str, list] = {
    "symbol": list(SYMBOLS),
    "setup": list(SETUPS),
    "session_hour": [0, 8, 13, 14],
    "window": [4, 8, 16],
    "entry_k": [0.5, 1.0, 1.5, 2.0, 2.5],
    "stop_atr": [0.75, 1.0, 1.5, 2.0],
    "target_r": [1.0, 1.5, 2.0, 3.0, 4.0],
    "breakeven_r": [0.0, 1.0, 1.5],
    "regime": ["any", "trend", "range"],
    "htf_filter": [False, True],
    "min_rvol": [0.0, 1.0, 1.5],
    "maker": [False, True],
    "allow_short": [False, True],
    "weekends": [False, True],
    "max_trades_per_day": [1, 2, 4],
}


def random_pro(rng: random.Random, symbols=SYMBOLS) -> ProGenome:
    genes = {k: rng.choice(v) for k, v in PRO_GENES.items()}
    genes["symbol"] = rng.choice(list(symbols))
    return ProGenome(**genes)


def mutate_pro(g: ProGenome, rng: random.Random, changes: int = 1) -> ProGenome:
    for _ in range(changes):
        name = rng.choice(sorted(PRO_GENES))
        values = PRO_GENES[name]
        i = values.index(getattr(g, name))
        g = replace(g, **{name: values[max(0, min(len(values) - 1, i + rng.choice((-1, 1))))]})
    return g


class Tools:
    """The indicators one genome needs, looked up once."""

    def __init__(self, market: Market, g: ProGenome):
        s = g.symbol
        self.o, self.h, self.l, self.c = market.open[s], market.high[s], market.low[s], market.close[s]
        self.atr = atr(market, s, 14)
        self.ema = ema(market, s, 200)
        self.vwap = vwap(market, s, g.session_hour)
        self.er = efficiency(market, s, max(g.window, 8))
        self.rvol = relative_volume(market, s) if g.min_rvol or g.setup == "exhaustion" else None
        self.mean, self.sd = market.stats(s, max(g.window, 8) * 2)
        self.squeeze = bandwidth_squeeze(market, s, max(g.window, 8) * 2) if g.setup == "squeeze" else None
        self.weekday = None if g.weekends else [datetime.fromtimestamp(t, tz=timezone.utc).weekday() >= 5
                                                for t in market.t[::BARS_PER_DAY]]


def setup_signal(g: ProGenome, x: Tools, i: int) -> int:
    """+1 buy, -1 sell, 0 nothing, judged on the close of bar i."""
    k = i % BARS_PER_DAY
    a = x.atr[i]
    if not a > 0 or k >= BARS_PER_DAY - NO_ENTRY_BARS - 1:
        return 0
    if x.weekday is not None and x.weekday[i // BARS_PER_DAY]:
        return 0
    s0 = g.session_hour * 4
    c, o, h, lo = x.c, x.o, x.h, x.l
    d = 0
    if g.setup == "orb":
        if not s0 + g.window <= k < s0 + g.window + 16:
            return 0
        day0 = i - k + s0
        top, bottom = max(h[day0:day0 + g.window]), min(lo[day0:day0 + g.window])
        edge = g.entry_k * 0.25 * a
        if c[i] > top + edge >= c[i - 1]:
            d = 1
        elif c[i] < bottom - edge <= c[i - 1]:
            d = -1
    elif g.setup == "vwap_revert":
        if s0 <= k < s0 + 4:
            return 0  # VWAP just reset: give it an hour
        z = (c[i] - x.vwap[i]) / a
        d = -1 if z > g.entry_k else 1 if z < -g.entry_k else 0
    elif g.setup == "vwap_pullback":
        v = x.vwap[i]
        if c[i] > v and c[i] > x.ema[i] and lo[i] <= v + 0.25 * a and c[i] > o[i] and c[i] - v < g.entry_k * a:
            d = 1
        elif c[i] < v and c[i] < x.ema[i] and h[i] >= v - 0.25 * a and c[i] < o[i] and v - c[i] < g.entry_k * a:
            d = -1
    elif g.setup == "momentum":
        if k != s0 + g.window * 2:
            return 0
        start = i - k + s0 - 1
        move = (c[i] - c[start]) / a
        d = 1 if move > g.entry_k * 2 else -1 if move < -g.entry_k * 2 else 0
    elif g.setup == "squeeze":
        sq = x.squeeze[i - 1]
        if sq == sq and sq <= 1.1:
            if c[i] > x.mean[i] + g.entry_k * x.sd[i]:
                d = 1
            elif c[i] < x.mean[i] - g.entry_k * x.sd[i]:
                d = -1
    elif g.setup == "exhaustion":
        rv = x.rvol[i]
        span = h[i] - lo[i]
        if rv == rv and rv >= 2 and span > g.entry_k * 1.5 * x.atr[i - 1] and abs(c[i] - o[i]) > 0.6 * span:
            d = -1 if c[i] > o[i] else 1
    if not d:
        return 0
    er = x.er[i]
    if g.regime == "trend" and not er >= 0.3 or g.regime == "range" and not er <= 0.2:
        return 0
    if g.htf_filter and g.setup not in ("vwap_revert", "exhaustion") and (c[i] - x.ema[i]) * d <= 0:
        return 0
    if g.min_rvol and x.rvol is not None and not x.rvol[i] >= g.min_rvol:
        return 0
    if d < 0 and not g.allow_short:
        return 0
    return d


@dataclass
class ProPosition:
    side: int
    entry: float
    notional: float
    stop: float
    target: float
    risk_dollars: float
    breakeven_at: float  # price at which the stop moves to break-even (inf/0 if never)
    opened: int


@dataclass
class ProTrader:
    """Same interface as Trader, so the desk's Prüfer and Chef handle both."""
    id: str
    genome: ProGenome
    capital: float
    allocation: float
    hired_day: int
    tools: Tools
    coin_flip: random.Random | None = None  # control: random direction, same rules
    position: ProPosition | None = None
    order: tuple | None = None  # (side, limit price or None, stop distance), placed on a bar's close
    pending: int = 0
    trades_today: int = 0
    day_pnl: float = 0.0
    losses_in_row: int = 0
    pause_until: int = -1
    now: int = 0
    daily: list[float] = field(default_factory=list)
    r_multiples: list[float] = field(default_factory=list)
    trades: int = 0
    wins: int = 0
    fees: float = 0.0
    gross: float = 0.0
    peak: float = 0.0

    def __post_init__(self):
        self.peak = self.capital

    @property
    def total(self) -> float:
        return sum(self.daily)

    def drawdown(self) -> float:
        return 1 - self.capital / self.peak if self.peak > 0 else 0.0

    def start_day(self) -> None:
        self.trades_today = 0
        self.day_pnl = 0.0

    def end_day(self) -> None:
        self.daily.append(self.day_pnl)
        self.peak = max(self.peak, self.capital)

    def step(self, market: Market, i: int, may_enter) -> None:
        g, x = self.genome, self.tools
        self.now = i
        last_of_day = i % BARS_PER_DAY == BARS_PER_DAY - 1
        entered_now = False

        if self.order and not self.position:
            side, limit, dist = self.order
            self.pending = side
            if may_enter(self, i):
                if limit is None:
                    entered_now = self._open(side, x.o[i] * (1 + side * SLIPPAGE), dist, TAKER_FEE, i)
                elif (x.l[i] < limit) if side > 0 else (x.h[i] > limit):
                    entered_now = self._open(side, limit, dist, MAKER_FEE, i)
        self.order = None
        self.pending = 0

        pos = self.position
        if pos:
            hit_stop = x.l[i] <= pos.stop if pos.side > 0 else x.h[i] >= pos.stop
            hit_target = (x.h[i] > pos.target if pos.side > 0 else x.l[i] < pos.target) and not entered_now
            if hit_stop:
                gap = x.o[i] if (x.o[i] < pos.stop if pos.side > 0 else x.o[i] > pos.stop) else pos.stop
                self._close(gap * (1 - pos.side * SLIPPAGE), TAKER_FEE)
            elif hit_target:
                self._close(pos.target, MAKER_FEE)
            elif pos.breakeven_at and ((x.h[i] >= pos.breakeven_at) if pos.side > 0 else (x.l[i] <= pos.breakeven_at)):
                pos.stop = pos.entry * (1 + pos.side * 2 * TAKER_FEE)
                pos.breakeven_at = 0.0

        if last_of_day:
            if self.position:
                self._close(x.c[i] * (1 - self.position.side * SLIPPAGE), TAKER_FEE)
            return
        if self.position or self.trades_today >= g.max_trades_per_day or i < self.pause_until:
            return
        if self.day_pnl <= -DAILY_STOP_R * g.risk * self.allocation:
            return
        side = setup_signal(g, x, i)
        if not side:
            return
        if self.coin_flip:
            side = self.coin_flip.choice((-1, 1))
        dist = g.stop_atr * x.atr[i]
        cost = (MAKER_FEE if g.maker else TAKER_FEE + SLIPPAGE) + TAKER_FEE + SLIPPAGE
        if g.target_r * dist / x.c[i] < MIN_TARGET_COST_RATIO * cost:
            return  # not worth the fees
        self.order = (side, x.c[i] if g.maker else None, dist)

    def _open(self, side: int, price: float, dist: float, fee: float, i: int) -> bool:
        g = self.genome
        risk_dollars = g.risk * self.capital
        notional = min(risk_dollars / (dist / price), MAX_LEVERAGE * self.capital)
        stop = price - side * dist
        self.position = ProPosition(side, price, notional, stop, price + side * g.target_r * dist, risk_dollars,
                                    price + side * g.breakeven_r * dist if g.breakeven_r else 0.0, i)
        self._book(-notional * fee, notional * fee)
        self.trades_today += 1
        return True

    def _close(self, price: float, fee: float) -> None:
        pos = self.position
        value = pos.notional * price / pos.entry
        gross = pos.side * (value - pos.notional)
        cost = value * fee
        self._book(gross - cost, cost)
        result = gross - cost - pos.notional * (MAKER_FEE if self.genome.maker else TAKER_FEE)
        self.r_multiples.append(result / pos.risk_dollars if pos.risk_dollars else 0.0)
        self.gross += gross
        self.trades += 1
        if result > 0:
            self.wins += 1
            self.losses_in_row = 0
        else:
            self.losses_in_row += 1
            if self.losses_in_row >= 2:
                self.pause_until = self.now + COOLDOWN_BARS
                self.losses_in_row = 0
        self.position = None

    def _book(self, amount: float, fee: float) -> None:
        self.capital += amount
        self.day_pnl += amount
        self.fees += fee


def t_stat(values: list[float]) -> float:
    n = len(values)
    if n < 2:
        return 0.0
    mean = sum(values) / n
    var = sum((v - mean) ** 2 for v in values) / (n - 1)
    return mean / math.sqrt(var / n) if var > 0 else 0.0


def pro_trade(g: ProGenome, market: Market, first_day: int, last_day: int, capital: float = 100.0,
              coin_flip: random.Random | None = None) -> ProTrader:
    """Run one professional trader alone over whole days [first_day, last_day). No compounding of the
    allocation: the trader keeps trading the capital it has, gains and losses included."""
    t = ProTrader("solo", g, capital, capital, first_day, Tools(market, g), coin_flip=coin_flip)

    def allow(*_):
        return True

    for day in range(first_day, last_day):
        t.start_day()
        for i in range(day * BARS_PER_DAY, (day + 1) * BARS_PER_DAY):
            t.step(market, i, allow)
        t.end_day()
    return t


def pro_exam(g: ProGenome, market: Market, first_day: int, last_day: int, capital: float = 100.0) -> Exam:
    t = pro_trade(g, market, first_day, last_day, capital)
    gains = sum(d for d in t.daily if d > 0)
    losses = -sum(d for d in t.daily if d < 0)
    equity, peak, worst = capital, capital, 0.0
    for d in t.daily:
        equity += d
        peak = max(peak, equity)
        worst = max(worst, 1 - equity / peak)
    days = max(1, len(t.daily))
    return Exam(t.total, t.trades, gains / losses if losses else (math.inf if gains else 0.0), worst,
                sum(d > 0 for d in t.daily) / days, t_stat(t.daily))
