"""Play-money wallet. Amounts are integer micro-USDC (6 decimals, like real USDC)."""

from __future__ import annotations

from dataclasses import dataclass

MICRO = 1_000_000

# Costs that recur no matter what the agent decides: they define its runway.
RECURRING_KINDS = frozenset({"server", "hosting", "llm"})
# One-off spending the agent chooses; capped per day by the guardrails.
DISCRETIONARY_KINDS = frozenset({"build", "marketing", "improve", "research", "spawn", "funding_out"})
COST_KINDS = RECURRING_KINDS | {"build", "marketing", "improve", "research", "spawn", "fulfillment", "fee"}


def usdc(amount: float) -> int:
    return round(amount * MICRO)


def fmt(micro: int) -> str:
    """German money format, e.g. 1.234,56 $."""
    cents = round(micro / (MICRO // 100))
    text = f"{abs(cents) / 100:,.2f}".replace(",", "_").replace(".", ",").replace("_", ".")
    return f"{'-' if cents < 0 else ''}{text} $"


@dataclass
class Tx:
    hour: int
    amount: int
    kind: str
    memo: str = ""


class Wallet:
    def __init__(self, address: str, balance: int = 0):
        self.address = address
        self.balance = balance
        self.txs: list[Tx] = []

    def credit(self, hour: int, amount: int, kind: str, memo: str = "") -> None:
        self._book(hour, amount, kind, memo)

    def debit(self, hour: int, amount: int, kind: str, memo: str = "") -> None:
        """Unavoidable cost: always booked, even if the balance drops below zero."""
        self._book(hour, -amount, kind, memo)

    def try_spend(self, hour: int, amount: int, kind: str, memo: str = "") -> bool:
        if amount > self.balance:
            return False
        self._book(hour, -amount, kind, memo)
        return True

    def transfer(self, hour: int, to: Wallet, amount: int, kind_out: str, kind_in: str, memo: str = "") -> bool:
        if amount <= 0 or amount > self.balance:
            return False
        self._book(hour, -amount, kind_out, memo)
        to._book(hour, amount, kind_in, memo)
        return True

    def sum(self, kinds=None, since: int = 0) -> int:
        return sum(t.amount for t in self.txs if t.hour >= since and (kinds is None or t.kind in kinds))

    def _book(self, hour: int, amount: int, kind: str, memo: str) -> None:
        if amount:
            self.balance += amount
            self.txs.append(Tx(hour, amount, kind, memo))
