import random

import pytest

from automaton.market import NICHES, adjusted_niches
from automaton.montecarlo import Blueprint, Job, RunResult, Score, run_world


def test_blueprint_round_trip(tmp_path):
    bp = Blueprint.from_genes({**Blueprint().genes(), "confidence": 2.0, "payout_share": 1.0})
    path = tmp_path / "plan.json"
    bp.save(path)
    assert Blueprint.load(path) == bp
    assert bp.strategy.confidence == 2.0
    assert bp.settings(days=5).payout_share == 1.0


def test_run_world_pads_the_days_after_everyone_is_gone():
    result = run_world(Job(Blueprint(), seed=1, days=10, capital=0.5, think_cost=0.1, uncertainty=0.0))
    assert len(result.creator) == 10 and not result.alive
    assert result.result == pytest.approx(-0.5, abs=0.01)


def test_score_counts_wins_and_losses():
    results = [RunResult((-5.0,), 0.0, 0.0, False, 1, 0), RunResult((10.0,), 1.0, 1.0, True, 1, 0)]
    score = Score.of(results, capital=20.0)
    assert score.p_profit == 0.5 and score.mean_loss == 2.5 and score.profit_days == 0.5


def test_scenario_factors_scale_the_assumptions():
    half = adjusted_niches(random.Random(0), demand=0.5)
    assert all(a.demand_per_hour == pytest.approx(b.demand_per_hour / 2) for a, b in zip(half, NICHES))
    assert adjusted_niches(random.Random(0)) == NICHES


def test_uncertainty_averages_out_to_the_assumptions():
    draws = [adjusted_niches(random.Random(i), uncertainty=1.0)[0].demand_per_hour for i in range(4000)]
    assert sum(draws) / len(draws) == pytest.approx(NICHES[0].demand_per_hour, rel=0.05)


def test_quantile_interpolates():
    from automaton.forecast import quantile
    assert quantile([0, 10], 0.5) == 5
    assert quantile([3, 1, 2], 0.0) == 1 and quantile([3, 1, 2], 1.0) == 3


def test_demand_threshold_is_the_weakest_demand_that_still_wins_often_enough():
    from automaton.forecast import DemandPoint, Forecast
    points = [DemandPoint(0.2, 0.3, -5, 0.1, 1, 0.5), DemandPoint(0.5, 0.85, 4, 0.5, 9, 3.0),
              DemandPoint(1.0, 0.95, 40, 0.7, 20, 8.0)]
    forecast = Forecast(20, 90, 10, 0.1, None, 0, 0, 0, 0, None, [], [], 10, points)
    assert forecast.threshold().factor == 0.5
    assert forecast.threshold(0.99) is None
