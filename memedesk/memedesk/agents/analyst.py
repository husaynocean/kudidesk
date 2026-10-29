"""ANALYST: scores every Filter survivor 0-100. Only 70+ goes to Executor.

Components (max points):
  momentum        20  1h/5m price change, 5m volume vs 1h pace
  unique_buyers   15  distinct buyer wallets in the last hour
  buy_sell        20  unique buyers / unique sellers (txn counts if unavailable)
  holder_growth   15  holders gained per hour since the pair was created
  liq_mcap        15  liquidity / market cap
  smart_wallets   15  wallets from your smart-wallet list holding the token

Missing data scores 0 for that component. It never gets the benefit of the doubt.
"""
from __future__ import annotations

import logging
from typing import Callable, Optional, Protocol, Union

from ..models import Flow, Kill, Pair, Scored, Survivor
from ..rules import RULES

log = logging.getLogger(__name__)


class FlowSource(Protocol):
    def flow(self, pair_address: str) -> Flow: ...


def ramp(x: Optional[float], lo: float, hi: float, pts: float) -> float:
    """0 at or below lo, `pts` at or above hi, linear between."""
    if x is None or x <= lo:
        return 0.0
    if x >= hi:
        return float(pts)
    return pts * (x - lo) / (hi - lo)


def momentum(p: Pair) -> float:
    pts = ramp(p.price_change_h1_pct, 0, 40, 12)
    pts += ramp(p.price_change_m5_pct, 0, 5, 4)
    if p.volume_h1_usd > 0:
        accel = p.volume_m5_usd * 12 / p.volume_h1_usd  # 1.0 = 5m pace equals hourly pace
        pts += ramp(accel, 0.5, 1.5, 4)
    return min(pts, 20.0)


def buy_sell(p: Pair, f: Flow) -> float:
    if f.buyers_h1 is not None and f.sellers_h1:
        ratio = f.buyers_h1 / f.sellers_h1
    elif p.sells_h1:
        ratio = p.buys_h1 / p.sells_h1
    else:
        return 0.0
    return ramp(ratio, 1.0, 2.0, 20)


def smart_points(n: int) -> float:
    return {0: 0.0, 1: 8.0, 2: 12.0}.get(n, 15.0)


def score(p: Pair, holders: Optional[int], f: Flow, smart_count: int, now: float) -> dict:
    age_h = max(p.age_hours(now), 0.5)
    growth = holders / age_h if holders is not None else None
    liq_ratio = p.liquidity_usd / p.market_cap_usd if p.market_cap_usd > 0 else None
    return {
        "momentum": round(momentum(p), 2),
        "unique_buyers": round(ramp(f.buyers_h1, 50, 400, 15), 2),
        "buy_sell": round(buy_sell(p, f), 2),
        "holder_growth": round(ramp(growth, 25, 400, 15), 2),
        "liq_mcap": round(ramp(liq_ratio, 0.04, 0.15, 15), 2),
        "smart_wallets": smart_points(smart_count),
    }


class Analyst:
    def __init__(self, flow: FlowSource, smart_counter: Callable[[str], int], clock: Callable[[], float]):
        self.flow = flow
        self.smart_counter = smart_counter
        self.clock = clock

    def assess(self, s: Survivor) -> Union[Scored, Kill]:
        try:
            f = self.flow.flow(s.pair.pair_address)
        except Exception as e:
            log.warning("flow %s failed: %s", s.pair.pair_address, e)
            f = Flow()
        try:
            smart = self.smart_counter(s.pair.mint)
        except Exception as e:
            log.warning("smart wallets %s failed: %s", s.pair.mint, e)
            smart = 0
        comps = score(s.pair, s.safety.holders, f, smart, self.clock())
        total = round(sum(comps.values()), 1)
        if total < RULES.min_score:
            detail = f"score {total} < {RULES.min_score} " + " ".join(f"{k}={v}" for k, v in comps.items())
            return Kill(stage="analyst", rule=None, reason=f"score under {RULES.min_score}", detail=detail)
        return Scored(pair=s.pair, safety=s.safety, score=total, components=comps)
