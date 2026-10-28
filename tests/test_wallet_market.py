import random

from automaton.market import NICHES, SATURATION_DAYS, Market, acceptance, poisson
from automaton.wallet import Wallet, fmt, usdc


def test_money_format_is_german_and_rounds_to_cents():
    assert fmt(usdc(1234.5)) == "1.234,50 $"
    assert fmt(-usdc(0.25)) == "-0,25 $"
    assert fmt(-1) == "0,00 $"


def test_wallet_refuses_optional_spending_but_books_unavoidable_costs():
    w = Wallet("x", usdc(1))
    assert not w.try_spend(0, usdc(2), "marketing")
    assert w.balance == usdc(1)
    w.debit(0, usdc(2), "server")
    assert w.balance == -usdc(1)


def test_transfer_moves_money_and_rejects_overdraft():
    a, b = Wallet("a", usdc(5)), Wallet("b")
    assert a.transfer(0, b, usdc(3), "funding_out", "funding_in")
    assert not a.transfer(0, b, usdc(3), "funding_out", "funding_in")
    assert (a.balance, b.balance) == (usdc(2), usdc(3))
    assert b.sum({"funding_in"}) == usdc(3)


def test_half_of_buyers_accept_the_reference_price_and_fewer_accept_more():
    assert abs(acceptance(1.0, 1.0) - 0.5) < 1e-9
    assert acceptance(0.5, 1.0) > acceptance(1.0, 1.0) > acceptance(2.0, 1.0)


def test_competition_grows_towards_saturation():
    market = Market(random.Random(0))
    niche = NICHES[0]
    assert market.competition(niche, 0) == niche.competition
    later = market.competition(niche, 24 * SATURATION_DAYS * 10)
    assert abs(later - niche.competition_max) < 1e-3


def test_poisson_mean():
    rng = random.Random(1)
    draws = [poisson(rng, 2.5) for _ in range(20000)]
    assert abs(sum(draws) / len(draws) - 2.5) < 0.05
