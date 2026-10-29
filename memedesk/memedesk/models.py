"""Messages passed between agents.

Every handoff is a frozen dataclass, so a downstream agent cannot edit what an
upstream agent decided. The one mutable object is the Position, which only
Risk changes, and its Stop can only ever move up.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


@dataclass(frozen=True)
class Pair:
    mint: str
    symbol: str
    pair_address: str
    dex: str
    url: str
    price_usd: float
    market_cap_usd: float
    liquidity_usd: float
    volume_m5_usd: float
    volume_h1_usd: float
    price_change_m5_pct: float
    price_change_h1_pct: float
    price_change_h6_pct: float
    buys_h1: int
    sells_h1: int
    created_at: float  # unix seconds

    def age_hours(self, now: float) -> float:
        return (now - self.created_at) / 3600.0


@dataclass(frozen=True)
class Safety:
    """On-chain safety facts. None means the fact could not be verified."""

    mint_authority_revoked: Optional[bool] = None
    freeze_authority_revoked: Optional[bool] = None
    lp_locked_pct: Optional[float] = None
    top10_pct: Optional[float] = None
    dev_pct: Optional[float] = None
    dev_past_rugs: Optional[bool] = None
    bundled_pct: Optional[float] = None
    holders: Optional[int] = None
    notes: tuple = ()


@dataclass(frozen=True)
class Kill:
    stage: str  # "filter" or "analyst"
    rule: Optional[int]  # filter rule number, None for analyst kills
    reason: str
    detail: str
    unverifiable: bool = False


@dataclass(frozen=True)
class Survivor:
    pair: Pair
    safety: Safety


@dataclass(frozen=True)
class Flow:
    buyers_h1: Optional[int] = None
    sellers_h1: Optional[int] = None


@dataclass(frozen=True)
class Scored:
    pair: Pair
    safety: Safety
    score: float
    components: dict = field(default_factory=dict)


@dataclass(frozen=True)
class Ticket:
    """Executor's order proposal. Cannot be submitted until Risk arms it."""

    mint: str
    symbol: str
    pair_address: str
    ref_price: float
    size_usd: float
    score: float


class StopViolation(Exception):
    pass


class Stop:
    """A stop price that can be raised but never lowered."""

    __slots__ = ("_price", "mode")

    def __init__(self, price: float, mode: str = "fixed"):
        if price <= 0:
            raise ValueError("stop must be positive")
        self._price = float(price)
        self.mode = mode

    @property
    def price(self) -> float:
        return self._price

    def raise_to(self, price: float, mode: Optional[str] = None) -> None:
        if price < self._price:
            raise StopViolation(f"refusing to lower stop {self._price} -> {price}")
        self._price = float(price)
        if mode:
            self.mode = mode

    def __repr__(self):
        return f"Stop({self._price:.10g}, {self.mode})"


@dataclass(frozen=True)
class ArmedTicket:
    ticket: Ticket
    stop: Stop


@dataclass(frozen=True)
class Fill:
    price: float  # effective price after slippage and impact
    qty: float
    usd: float  # cash spent (buy) or received (sell)
    fees_usd: float
    market_price: float


@dataclass
class Position:
    mint: str
    symbol: str
    pair_address: str
    entry_price: float
    qty: float
    cost_usd: float
    score: float
    opened_at: float
    stop: Stop
    peak_price: float
    trailing: bool = False
    last_price: Optional[float] = None

    def to_dict(self) -> dict:
        return {
            "mint": self.mint, "symbol": self.symbol, "pair_address": self.pair_address,
            "entry_price": self.entry_price, "qty": self.qty, "cost_usd": self.cost_usd,
            "score": self.score, "opened_at": self.opened_at,
            "stop": self.stop.price, "stop_mode": self.stop.mode,
            "peak_price": self.peak_price, "trailing": self.trailing,
            "last_price": self.last_price,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "Position":
        return cls(
            mint=d["mint"], symbol=d["symbol"], pair_address=d["pair_address"],
            entry_price=d["entry_price"], qty=d["qty"], cost_usd=d["cost_usd"],
            score=d["score"], opened_at=d["opened_at"],
            stop=Stop(d["stop"], d.get("stop_mode", "fixed")),
            peak_price=d["peak_price"], trailing=d.get("trailing", False),
            last_price=d.get("last_price"),
        )


@dataclass(frozen=True)
class ExitSignal:
    mint: str
    reason: str  # "stop" or "trail"
    trigger_price: float
    stop_price: float
