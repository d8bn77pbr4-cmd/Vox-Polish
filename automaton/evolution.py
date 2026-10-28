"""Survival of the fittest across many worlds: a genetic algorithm breeds the best blueprint.

Each candidate is scored on the same training worlds (fair comparison). The winner is chosen on
separate validation worlds, so it cannot simply be lucky on the worlds it was bred on."""

from __future__ import annotations

import random
from typing import Callable

from .montecarlo import ALL_GENES, Blueprint, Score, Simulator

TRAIN_SEEDS = range(10_000, 10_064)
VALIDATION_SEEDS = range(20_000, 20_150)


def crossover(a: dict, b: dict, rng: random.Random) -> dict:
    return {k: (a if rng.random() < 0.5 else b)[k] for k in ALL_GENES}


def mutate(genes: dict, rng: random.Random, rate: float = 0.15) -> dict:
    out = dict(genes)
    names = [k for k in ALL_GENES if rng.random() < rate] or [rng.choice(sorted(ALL_GENES))]
    for name in names:
        values = ALL_GENES[name]
        i = values.index(out[name]) if out[name] in values else 0
        out[name] = values[max(0, min(len(values) - 1, i + rng.choice((-1, 1))))]
    return out


def random_genes(rng: random.Random) -> dict:
    return {k: rng.choice(v) for k, v in ALL_GENES.items()}


def evolve(sim: Simulator, start: Blueprint, generations: int = 10, population: int = 20, elite: int = 5,
           days: int = 60, capital: float = 20.0, think_cost: float = 0.10, seed: int = 0,
           log: Callable[[str], None] = print, also: tuple[Blueprint, ...] = ()) -> list[tuple[Score, Blueprint]]:
    """Returns the finalists ranked on the validation worlds, best first."""
    rng = random.Random(seed)
    cache: dict[tuple, Score] = {}

    def score(genes: dict, seeds=TRAIN_SEEDS) -> Score:
        key = (tuple(sorted(genes.items())), seeds.start)
        if key not in cache:
            cache[key] = Score.of(sim.run(Blueprint.from_genes(genes), seeds, days, capital, think_cost), capital)
        return cache[key]

    pool = [start.genes()] + [b.genes() for b in also]
    pool += [random_genes(rng) for _ in range(population - len(pool))]
    for generation in range(1, generations + 1):
        ranked = sorted(pool, key=lambda g: score(g).value, reverse=True)
        best = score(ranked[0])
        log(f"Generation {generation:2}: bester Wert {best.value:.3f} | Gewinntage {best.profit_days:.0%} | "
            f"Auszahlungstage {best.payout_days:.0%} | Gewinn für dich {best.p_profit:.0%} | "
            f"Ø Ergebnis {best.mean_result:+.0f} $")
        parents = ranked[:elite]
        children = []
        while len(children) < population - elite:
            a, b = rng.sample(parents, 2)
            child = mutate(crossover(a, b, rng), rng)
            if child not in parents and child not in children:
                children.append(child)
        pool = parents + children

    finalists = sorted(pool, key=lambda g: score(g).value, reverse=True)[:elite]
    if start.genes() not in finalists:
        finalists.append(start.genes())
    validated = [(score(g, VALIDATION_SEEDS), Blueprint.from_genes(g)) for g in finalists]
    return sorted(validated, key=lambda sb: sb[0].value, reverse=True)
