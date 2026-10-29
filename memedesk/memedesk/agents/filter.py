"""FILTER: 8 kill rules. One hit = dead, no exceptions.

Cheap rules that only need DexScreener numbers (3, 4, 8) run first so we do not
spend RPC / RugCheck calls on pairs that are already dead. A fact that cannot be
verified counts as a hit: an unknown is not a pass.
"""
from __future__ import annotations

import logging
from typing import Protocol, Union

from ..models import Kill, Pair, Safety, Survivor
from ..rules import FILTER_RULES, RULES

log = logging.getLogger(__name__)


class SafetySource(Protocol):
    def fetch(self, pair: Pair) -> Safety: ...


def _kill(rule: int, detail: str, unverifiable: bool = False) -> Kill:
    return Kill(stage="filter", rule=rule, reason=FILTER_RULES[rule], detail=detail,
                unverifiable=unverifiable)


def _unknown(rule: int, what: str) -> Kill:
    return _kill(rule, f"could not verify {what}", unverifiable=True)


class Filter:
    def __init__(self, safety: SafetySource):
        self.safety = safety

    def check(self, pair: Pair) -> Union[Kill, Survivor]:
        if pair.liquidity_usd < RULES.min_liquidity_usd:
            return _kill(3, f"liquidity ${pair.liquidity_usd:,.0f}")
        if pair.volume_h1_usd < RULES.min_volume_h1_usd:
            return _kill(4, f"1h volume ${pair.volume_h1_usd:,.0f}")
        if pair.price_change_h1_pct >= RULES.max_price_change_h1_pct:
            return _kill(8, f"1h change +{pair.price_change_h1_pct:.0f}%")

        try:
            s = self.safety.fetch(pair)
        except Exception as e:
            log.warning("safety fetch %s failed: %s", pair.mint, e)
            s = Safety(notes=(f"safety fetch failed: {e}",))

        if s.mint_authority_revoked is None or s.freeze_authority_revoked is None:
            return _unknown(1, "mint/freeze authority")
        if not s.mint_authority_revoked or not s.freeze_authority_revoked:
            live = [n for n, ok in (("mint", s.mint_authority_revoked),
                                    ("freeze", s.freeze_authority_revoked)) if not ok]
            return _kill(1, f"{' and '.join(live)} authority still set")

        if s.lp_locked_pct is None:
            return _unknown(2, "LP burn/lock")
        if s.lp_locked_pct < RULES.min_lp_locked_pct:
            return _kill(2, f"LP locked/burned {s.lp_locked_pct:.1f}%")

        if s.top10_pct is None:
            return _unknown(5, "top 10 holders")
        if s.top10_pct > RULES.max_top10_pct:
            return _kill(5, f"top 10 hold {s.top10_pct:.1f}%")

        if s.dev_pct is None or s.dev_past_rugs is None:
            return _unknown(6, "dev holdings/history")
        if s.dev_past_rugs:
            return _kill(6, "dev has past rugs")
        if s.dev_pct > RULES.max_dev_pct:
            return _kill(6, f"dev holds {s.dev_pct:.2f}%")

        if s.bundled_pct is None:
            return _unknown(7, "launch bundles")
        if s.bundled_pct > RULES.max_bundled_pct:
            return _kill(7, f"bundled {s.bundled_pct:.1f}%")

        return Survivor(pair=pair, safety=s)
