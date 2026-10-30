import random

import pytest

from automaton.trading.data import BARS_PER_DAY, Bar
from automaton.trading.desk import Desk, DeskSettings
from automaton.trading.indicators import atr, efficiency, vwap
from automaton.trading.pro import (DAILY_STOP_R, MAKER_FEE, SETUPS, ProGenome, ProPosition, ProTrader, Tools,
                                   mutate_pro, pro_trade, random_pro, setup_signal, t_stat)
from automaton.trading.research import monthly
from automaton.trading.strategy import Market


def walk(n, seed, vol=0.004):
    rng, price, bars = random.Random(seed), 100.0, []
    for k in range(n):
        o = price
        price *= 1 + rng.gauss(0, vol)
        hi, lo = max(o, price) * (1 + abs(rng.gauss(0, vol / 2))), min(o, price) * (1 - abs(rng.gauss(0, vol / 2)))
        bars.append(Bar(900 * k, o, hi, lo, price, 10 + rng.random() * 20 * (1 + (k % BARS_PER_DAY == 60) * 5)))
    return bars


def market_of(bars):
    return Market({"BTCUSDT": bars})


def test_atr_of_constant_ranges():
    bars = [Bar(900 * k, 100, 101, 99, 100) for k in range(50)]
    assert atr(market_of(bars), "BTCUSDT")[40] == pytest.approx(2.0)


def test_vwap_restarts_at_the_session_hour():
    price = [100.0 if k < BARS_PER_DAY + 8 else 200.0 for k in range(2 * BARS_PER_DAY)]
    bars = [Bar(900 * k, p, p, p, p, 1) for k, p in enumerate(price)]
    v = vwap(market_of(bars), "BTCUSDT", anchor_hour=2)
    assert v[BARS_PER_DAY + 7] == pytest.approx(100)  # same session as before
    assert v[BARS_PER_DAY + 8] == pytest.approx(200)  # 02:00 UTC: a new session, only the new price


def test_efficiency_is_one_for_a_straight_line():
    bars = [Bar(900 * k, 100 + k, 100 + k, 100 + k, 100 + k) for k in range(40)]
    assert efficiency(market_of(bars), "BTCUSDT", 10)[30] == pytest.approx(1.0)


@pytest.mark.parametrize("setup", SETUPS)
def test_setups_use_no_future_bars(setup):
    bars = walk(BARS_PER_DAY * 25, 3)
    g = ProGenome(setup=setup, entry_k=0.5, htf_filter=False, session_hour=0, window=4)
    full, prefix = market_of(bars), market_of(bars[:BARS_PER_DAY * 23])
    tf, tp = Tools(full, g), Tools(prefix, g)
    for i in range(BARS_PER_DAY * 21, BARS_PER_DAY * 23):
        assert setup_signal(g, tf, i) == setup_signal(g, tp, i)


def make_trader(bars, **genes):
    g = ProGenome(**{"risk": 0.01, "stop_atr": 1.0, "target_r": 2.0, "breakeven_r": 0.0, **genes})
    market = market_of(bars)
    return market, ProTrader("t", g, 100.0, 100.0, 0, Tools(market, g))


def test_limit_entry_needs_price_to_trade_through_and_size_follows_risk():
    bars = [Bar(900 * k, 100, 101, 99, 100) for k in range(40)]
    bars.append(Bar(900 * 40, 100, 100.5, 100.0, 100.2))  # touches 100 but does not trade below
    bars.append(Bar(900 * 41, 100.2, 100.5, 99.9, 100.1))  # trades through
    market, t = make_trader(bars)
    t.order = (1, 100.0, 2.0)
    t.step(market, 40, lambda *_: True)
    assert t.position is None
    t.order = (1, 100.0, 2.0)
    t.step(market, 41, lambda *_: True)
    assert t.position.entry == 100.0
    assert t.position.notional == pytest.approx(0.01 * 100 / 0.02)  # 1 $ risk over a 2 % stop
    assert t.fees == pytest.approx(t.position.notional * MAKER_FEE)


def test_daily_stop_after_three_r():
    bars = walk(BARS_PER_DAY * 2, 5)
    market, t = make_trader(bars)
    t.start_day()
    t.day_pnl = -DAILY_STOP_R * 0.01 * 100 - 0.01
    for i in range(BARS_PER_DAY, BARS_PER_DAY + 40):
        t.step(market, i, lambda *_: True)
    assert t.order is None and t.position is None


def test_flat_at_day_end_and_stop_counts_first():
    bars = [Bar(900 * k, 100, 101, 99, 100) for k in range(BARS_PER_DAY)]
    market, t = make_trader(bars)
    t.position = ProPosition(1, 100.0, 50.0, 99.5, 100.5, 0.25, 0.0, 0)
    t.step(market, 30, lambda *_: True)
    assert t.position is None and t.r_multiples[0] < 0  # high and low both touched: the stop counts
    t.position = ProPosition(1, 100.0, 50.0, 90.0, 110.0, 5.0, 0.0, 0)
    t.step(market, BARS_PER_DAY - 1, lambda *_: True)
    assert t.position is None


def test_trades_that_cannot_beat_fees_are_skipped():
    bars = walk(BARS_PER_DAY * 25, 7, vol=0.0002)  # moves far too small for the fees
    t = pro_trade(ProGenome(setup="vwap_revert", entry_k=0.5, htf_filter=False, target_r=1.0, stop_atr=0.75),
                  market_of(bars), 21, 25)
    assert t.trades == 0


def test_coin_flip_control_changes_directions_not_rules():
    bars = walk(BARS_PER_DAY * 30, 11)
    g = ProGenome(setup="vwap_revert", entry_k=0.5, htf_filter=False, maker=False)
    real = pro_trade(g, market_of(bars), 21, 30)
    flip = pro_trade(g, market_of(bars), 21, 30, coin_flip=random.Random(1))
    assert real.trades > 0 and flip.trades > 0 and real.r_multiples != flip.r_multiples


def test_genomes_mutate_within_the_gene_values():
    rng = random.Random(0)
    g = random_pro(rng)
    for _ in range(30):
        g = mutate_pro(g, rng)
    assert g.setup in SETUPS and g.symbol == "BTCUSDT" or g.symbol in ("ETHUSDT", "SOLUSDT")


def test_t_stat():
    assert t_stat([1.0, 1.0]) == 0.0
    assert t_stat([1.0, 2.0, 3.0]) == pytest.approx(2.0 / (1.0 / 3 ** 0.5))


def test_chef_limits_positions_on_the_same_side():
    market = market_of(walk(BARS_PER_DAY * 3, 2))
    desk = Desk(market, DeskSettings(kind="pro", max_same_direction=1, exam_days=1))
    a = ProTrader("A", ProGenome(), 50.0, 50.0, 0, Tools(market, ProGenome()))
    b = ProTrader("B", ProGenome(), 50.0, 50.0, 0, Tools(market, ProGenome()))
    a.position = ProPosition(1, 100.0, 10.0, 99.0, 102.0, 0.1, 0.0, 0)
    desk.traders += [a, b]
    b.pending = 1
    assert not desk.pruefer_allows(b, 5)
    b.pending = -1
    assert desk.pruefer_allows(b, 5)


def test_pro_desk_draws_candidates_from_the_playbook():
    market = market_of(walk(BARS_PER_DAY * 3, 2))
    favourite = ProGenome(setup="momentum", entry_k=2.5)
    desk = Desk(market, DeskSettings(kind="pro", playbook=(favourite,)))
    picks = [desk._candidate() for _ in range(200)]
    assert picks.count(favourite) > 60


def test_monthly_groups_days_by_calendar_month():
    bars = [Bar(1735689600 + 900 * k, 1, 1, 1, 1) for k in range(BARS_PER_DAY * 40)]  # from 2025-01-01
    months = monthly(market_of(bars), 0, [1.0] * 40)
    assert months == [("2025-01", 31.0), ("2025-02", 9.0)]
