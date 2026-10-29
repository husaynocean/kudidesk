"""Gathers the on-chain facts the Filter needs.

Sources:
  * Solana RPC     - mint/freeze authority, supply, dev wallet balance (authoritative)
  * RugCheck       - LP lock %, top holders, creator, known AMM/locker accounts, rug flags
  * trench.bot     - % of supply bought in bundles at launch

Anything that cannot be verified is left as None. The Filter kills on None.
"""
from __future__ import annotations

import logging
from typing import Optional

from ..models import Pair, Safety
from .http import Http, num
from .solana_rpc import SolanaRPC

log = logging.getLogger(__name__)

RUGCHECK = "https://api.rugcheck.xyz/v1"
TRENCH = "https://trench.bot/api/bundle/bundle_advanced"

# Holder accounts that are pool vaults or lockers, not people.
NON_HOLDER_TYPES = {"AMM", "LOCKER"}
BONDING_CURVE_DEXES = {"pumpfun"}


def lp_locked_pct(report: dict, pair: Pair) -> Optional[float]:
    if pair.dex in BONDING_CURVE_DEXES:
        # Pre-graduation liquidity sits in the pump.fun bonding-curve program.
        # Nobody can withdraw it, so it counts as locked.
        return 100.0
    markets = report.get("markets") or []
    if not markets:
        return None
    market = next((m for m in markets if m.get("pubkey") == pair.pair_address), None)
    if market is None:
        return None
    lp = market.get("lp") or {}
    if lp.get("lpLockedPct") is None:
        return None
    return num(lp.get("lpLockedPct"))


def excluded_accounts(report: dict) -> set:
    out = set()
    for addr, meta in (report.get("knownAccounts") or {}).items():
        if (meta or {}).get("type") in NON_HOLDER_TYPES:
            out.add(addr)
    for m in report.get("markets") or []:
        for key in ("liquidityAAccount", "liquidityBAccount", "liquidityA", "liquidityB", "pubkey"):
            if isinstance(m.get(key), str):
                out.add(m[key])
    return out


def top10_pct(report: dict, supply_raw: int) -> Optional[float]:
    holders = report.get("topHolders") or []
    if not holders or supply_raw <= 0:
        return None
    skip = excluded_accounts(report)
    real = [h for h in holders if h.get("address") not in skip and h.get("owner") not in skip]
    amounts = sorted((int(num(h.get("amount"))) for h in real), reverse=True)[:10]
    return 100.0 * sum(amounts) / supply_raw


def past_rugs(report: dict) -> bool:
    """True if RugCheck flags this token or its creator for rugging.

    Assumes RugCheck surfaces creator history in `risks` / `creatorTokens`.
    Check the first paper run's rule-6 kill details to confirm.
    """
    if report.get("rugged"):
        return True
    for r in report.get("risks") or []:
        text = f"{r.get('name', '')} {r.get('description', '')}".lower()
        if "rug" in text:
            return True
    for t in report.get("creatorTokens") or []:
        if isinstance(t, dict) and t.get("rugged"):
            return True
    return False


class OnChainSafety:
    def __init__(self, http: Http, rpc: SolanaRPC):
        self.http = http
        self.rpc = rpc

    def _rugcheck(self, mint: str) -> Optional[dict]:
        try:
            return self.http.get_json(f"{RUGCHECK}/tokens/{mint}/report")
        except Exception as e:
            log.warning("rugcheck %s: %s", mint, e)
            return None

    def _bundled_pct(self, mint: str) -> Optional[float]:
        try:
            data = self.http.get_json(f"{TRENCH}/{mint}") or {}
        except Exception as e:
            log.warning("bundles %s: %s", mint, e)
            return None
        v = data.get("total_percentage_bundled")
        return num(v) if v is not None else None

    def fetch(self, pair: Pair) -> Safety:
        notes = []
        mint = pair.mint
        info = None
        try:
            info = self.rpc.mint_info(mint)
        except Exception as e:
            notes.append(f"rpc mint_info failed: {e}")
        report = self._rugcheck(mint)
        if report is None:
            notes.append("rugcheck report unavailable")

        mint_rev = freeze_rev = None
        supply = 0
        if info:
            mint_rev = info["mint_authority"] is None
            freeze_rev = info["freeze_authority"] is None
            supply = info["supply"]

        lp = top10 = dev = holders = None
        rugs = None
        if report:
            lp = lp_locked_pct(report, pair)
            top10 = top10_pct(report, supply)
            rugs = past_rugs(report)
            holders = report.get("totalHolders")
            creator = report.get("creator")
            if creator and supply > 0:
                try:
                    dev = 100.0 * self.rpc.wallet_token_balance(creator, mint) / supply
                except Exception as e:
                    notes.append(f"dev balance failed: {e}")
            elif not creator:
                notes.append("creator unknown")

        return Safety(
            mint_authority_revoked=mint_rev,
            freeze_authority_revoked=freeze_rev,
            lp_locked_pct=lp,
            top10_pct=top10,
            dev_pct=dev,
            dev_past_rugs=rugs,
            bundled_pct=self._bundled_pct(mint),
            holders=int(holders) if holders is not None else None,
            notes=tuple(notes),
        )
