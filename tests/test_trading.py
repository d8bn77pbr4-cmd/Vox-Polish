import random

import pytest

from automaton.trading.data import BARS_PER_DAY, Bar, align, months
from automaton.trading.desk import Desk, DeskSettings
from automaton.trading.evaluate import bootstrap, run_desk, shuffled
from automaton.trading.strategy import Exam, Market, Position, Trader, TraderGenome, backtest, signal


def bars_from(closes, start=0):
    bars, prev = [], closes[0]
    for k, c in enumerate(closes):
        bars.append(Bar(start + 900 * k, prev, max(prev, c), min(prev, c), c))
        prev = c
    return bars


def market_of(closes):
    return Market({"BTCUSDT": bars_from(closes)})


def random_walk(n, seed, vol=0.003):
    rng, price, out = random.Random(seed), 100.0, []
    for _ in range(n):
        price *= 1 + rng.gauss(0, vol)
        out.append(price)
    return out


def never(*_):
    return False


def always(*_):
    return True


BREAKOUT = TraderGenome(style="breakout", lookback=8, threshold=1.0, stop=0.5, take=0.5, size=1.0,
                        max_trades_per_day=1)


def test_months_are_inclusive():
    assert months("2025-11", "2026-02") == ["2025-11", "2025-12", "2026-01", "2026-02"]


def test_align_keeps_only_complete_days_all_coins_share():
    full = bars_from([100.0] * (2 * BARS_PER_DAY))
    gap = full[:BARS_PER_DAY + 10] + full[BARS_PER_DAY + 11:]
    aligned = align({"A": full, "B": gap})
    assert len(aligned["A"]) == len(aligned["B"]) == BARS_PER_DAY


def test_signal_uses_no_future_prices():
    closes = random_walk(300, 1)
    full, prefix = market_of(closes), market_of(closes[:200])
    for i in range(50, 200):
        assert signal(BREAKOUT, full, i) == signal(BREAKOUT, prefix, i)


def test_fills_at_next_open_pays_fees_and_is_flat_at_day_end():
    closes = [100.0] * 20 + [110.0] * (BARS_PER_DAY - 20)
    market = market_of(closes)
    t = Trader("t", BREAKOUT, 100.0, 100.0, 0, cost_per_side=0.001)
    t.start_day()
    for i in range(BARS_PER_DAY):
        t.step(market, i, always)
        if i == 21:
            assert t.position.entry == 110.0  # signal on the close of bar 20, filled at bar 21's open
    t.end_day()
    assert t.position is None and t.trades == 1
    assert t.capital == pytest.approx(100 - 0.1 - 0.1)


def test_stop_counts_before_target_when_one_bar_touches_both():
    market = Market({"BTCUSDT": [Bar(0, 100, 100, 100, 100), Bar(900, 100, 102, 98, 100)]})
    g = TraderGenome(stop=0.01, take=0.01, size=1.0)
    t = Trader("t", g, 100.0, 100.0, 0, cost_per_side=0.0)
    t.position = Position(1, 100.0, 100.0)
    t.step(market, 1, never)
    assert t.position is None and t.capital == pytest.approx(99.0)


def test_mean_reversion_wins_on_a_zigzag_and_fees_eat_a_random_walk():
    zigzag = [100 + (3 if (k // 4) % 2 else -3) + random.Random(k).uniform(-0.2, 0.2) for k in range(BARS_PER_DAY * 20)]
    fade = TraderGenome(style="meanrev", lookback=16, threshold=1.0, stop=0.05, take=0.05, size=1.0,
                        max_trades_per_day=8)
    assert backtest(fade, market_of(zigzag), 1, 20, cost_per_side=0.0).pnl > 0
    results = [backtest(fade, market_of(random_walk(BARS_PER_DAY * 20, s)), 1, 20, cost_per_side=0.0007).pnl
               for s in range(8)]
    assert sum(results) / len(results) < 0


def test_exam_rules():
    assert Exam(5.0, 20, 1.5, 0.05, 0.6).passed(10, 1.3, 0.1)
    assert not Exam(-1.0, 20, 1.5, 0.05, 0.6).passed(10, 1.3, 0.1)  # lost money
    assert not Exam(5.0, 3, 1.5, 0.05, 0.6).passed(10, 1.3, 0.1)  # too few trades to judge
    assert not Exam(5.0, 20, 1.1, 0.05, 0.6).passed(10, 1.3, 0.1)  # profit factor too low
    assert not Exam(5.0, 20, 1.5, 0.2, 0.6).passed(10, 1.3, 0.1)  # drawdown too deep


def flat_desk(days=20, **overrides):
    market = market_of([100.0] * (BARS_PER_DAY * days))
    return Desk(market, DeskSettings(capital=100.0, exam_days=2, **overrides))


def test_chef_switches_off_a_trader_without_profit_and_takes_the_money_back():
    desk = flat_desk(review_days=3)
    desk.pool -= 25
    desk.traders.append(Trader("T1", TraderGenome(), 25.0, 25.0, 2, desk.cost_per_side))
    for day in range(2, 5):
        desk.trade_day(day)
    assert not desk.traders and desk.retired[0].id == "T1"
    assert any("T1 abgeschaltet" in text for _, _, text in desk.events)


def test_pruefer_blocks_new_positions_after_the_daily_loss_limit():
    desk = flat_desk(trader_daily_loss=0.03)
    t = Trader("T1", TraderGenome(), 25.0, 25.0, 0, desk.cost_per_side)
    assert desk.pruefer_allows(t, 0)
    t.day_pnl = -0.8
    assert not desk.pruefer_allows(t, 0)
    t.day_pnl = 0.0
    desk.halted_today = True
    assert not desk.pruefer_allows(t, 0)


def test_chef_skims_profit_pays_a_share_and_stops_at_the_loss_limit():
    desk = flat_desk()
    t = Trader("T1", TraderGenome(), 30.0, 25.0, 0, desk.cost_per_side)
    desk.pool -= 25
    desk.traders.append(t)
    desk.chef_skim()
    assert t.capital == 25.0 and desk.pool == pytest.approx(80.0)
    assert desk.chef_pay() == pytest.approx(0.3 * 5)
    desk.pool -= 30
    desk.chef_check_stop(5)
    assert desk.stopped and not desk.traders and desk.stopped_day == 5


def test_no_hire_when_nobody_passes_the_exam():
    desk = flat_desk()
    assert desk.chef_hire(5) == 0 and desk.exams == desk.settings.candidates
    assert any("Keiner" in text for _, _, text in desk.events)


def test_running_costs_are_booked_every_day():
    market = market_of([100.0] * (BARS_PER_DAY * 6))
    out = run_desk(market, DeskSettings(capital=100.0, exam_days=2), 0, 6)
    assert out.result == pytest.approx(-out.costs) and out.costs == pytest.approx(6 * (0.24 + 2 * 0.02))


def test_shuffled_control_keeps_the_moves_but_not_their_order():
    market = market_of(random_walk(BARS_PER_DAY * 3, 2))
    control = shuffled(market, random.Random(0))
    ratios = lambda m: sorted(round(m.close["BTCUSDT"][k] / m.close["BTCUSDT"][k - 1], 10) for k in range(1, m.n))
    assert ratios(control) == ratios(market)
    assert control.close["BTCUSDT"] != market.close["BTCUSDT"]


def test_bootstrap_of_losing_days_forecasts_a_loss():
    fc = bootstrap([[-0.01] * 30], 100.0, DeskSettings(), days=20, paths=50)
    assert fc.p_profit == 0 and fc.p50 < 0
