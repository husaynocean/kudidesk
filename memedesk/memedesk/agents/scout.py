"""SCOUT: watches new Solana pairs and passes every in-window pair to Filter.

Window: pair age 30 min to 72 h, market cap $300k to $20M, Pump.fun / PumpSwap /
Raydium only. Tokens seen too early (or with mcap not in the window yet) go on
a watchlist and are re-checked every scan until they age past 72 h. A token is
passed at most once.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Protocol

from ..models import Pair
from ..rules import RULES

log = logging.getLogger(__name__)

MAX_WATCH = 600


class PairSource(Protocol):
    def discover_mints(self) -> list: ...
    def pairs_for_mints(self, mints: list) -> list: ...


@dataclass
class ScoutMemory:
    passed: set = field(default_factory=set)
    watch: dict = field(default_factory=dict)  # mint -> first seen (unix)

    def to_dict(self):
        return {"passed": sorted(self.passed), "watch": self.watch}

    @classmethod
    def from_dict(cls, d):
        return cls(passed=set(d.get("passed", [])), watch=dict(d.get("watch", {})))


@dataclass(frozen=True)
class ScanResult:
    discovered: int
    passed: tuple
    errors: tuple = ()


def best_pair(pairs: list) -> dict:
    """Deepest-liquidity pair per mint on an allowed dex."""
    best = {}
    for p in pairs:
        if p.dex not in RULES.allowed_dexes:
            continue
        cur = best.get(p.mint)
        if cur is None or p.liquidity_usd > cur.liquidity_usd:
            best[p.mint] = p
    return best


def in_window(p: Pair, now: float) -> bool:
    age_h = p.age_hours(now)
    return (RULES.min_pair_age_min / 60 <= age_h <= RULES.max_pair_age_h
            and RULES.min_mcap_usd <= p.market_cap_usd <= RULES.max_mcap_usd)


class Scout:
    def __init__(self, sources: list, resolver: PairSource, memory: ScoutMemory):
        self.sources = sources
        self.resolver = resolver
        self.memory = memory

    def scan(self, now: float) -> ScanResult:
        mints, errors = [], []
        for src in self.sources:
            try:
                mints += src()
            except Exception as e:
                log.warning("scout source failed: %s", e)
                errors.append(f"discovery source failed: {e}")
        for m in mints:
            if m not in self.memory.passed:
                self.memory.watch.setdefault(m, now)

        # Drop stale or overflow watch entries, oldest first.
        horizon = now - RULES.max_pair_age_h * 3600
        watch = {m: t for m, t in self.memory.watch.items() if t >= horizon}
        if len(watch) > MAX_WATCH:
            watch = dict(sorted(watch.items(), key=lambda kv: kv[1])[-MAX_WATCH:])
        self.memory.watch = watch

        try:
            pairs = best_pair(self.resolver.pairs_for_mints(list(watch)))
        except Exception as e:
            log.warning("scout resolve failed: %s", e)
            errors.append(f"pair lookup failed: {e}")
            return ScanResult(discovered=len(watch), passed=(), errors=tuple(errors))

        passed = []
        for mint, p in pairs.items():
            if p.age_hours(now) > RULES.max_pair_age_h:
                self.memory.watch.pop(mint, None)
                continue
            if in_window(p, now):
                passed.append(p)
                self.memory.passed.add(mint)
                self.memory.watch.pop(mint, None)
        return ScanResult(discovered=len(watch), passed=tuple(passed), errors=tuple(errors))
