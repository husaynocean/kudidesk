"""DexScreener: discovery feeds, pair data and live prices."""
from __future__ import annotations

from typing import Iterable, Optional

from ..models import Pair
from .http import Http, num

BASE = "https://api.dexscreener.com"
CHAIN = "solana"


def parse_pair(d: dict) -> Optional[Pair]:
    """Turn a DexScreener pair object into a Pair, or None if key data is missing."""
    try:
        if d.get("chainId") != CHAIN:
            return None
        base = d.get("baseToken") or {}
        price = num(d.get("priceUsd"), 0)
        created = d.get("pairCreatedAt")
        if not base.get("address") or price <= 0 or not created:
            return None
        txns_h1 = (d.get("txns") or {}).get("h1") or {}
        vol = d.get("volume") or {}
        chg = d.get("priceChange") or {}
        return Pair(
            mint=base["address"],
            symbol=base.get("symbol") or "?",
            pair_address=d["pairAddress"],
            dex=(d.get("dexId") or "").lower(),
            url=d.get("url") or "",
            price_usd=price,
            market_cap_usd=num(d.get("marketCap"), num(d.get("fdv"))),
            liquidity_usd=num((d.get("liquidity") or {}).get("usd")),
            volume_m5_usd=num(vol.get("m5")),
            volume_h1_usd=num(vol.get("h1")),
            price_change_m5_pct=num(chg.get("m5")),
            price_change_h1_pct=num(chg.get("h1")),
            price_change_h6_pct=num(chg.get("h6")),
            buys_h1=int(num(txns_h1.get("buys"))),
            sells_h1=int(num(txns_h1.get("sells"))),
            created_at=float(created) / 1000.0,
        )
    except (KeyError, TypeError, ValueError):
        return None


def _chunks(items: list, n: int) -> Iterable[list]:
    for i in range(0, len(items), n):
        yield items[i:i + n]


class DexScreener:
    def __init__(self, http: Http):
        self.http = http

    def _mints_from_feed(self, path: str) -> list:
        rows = self.http.get_json(BASE + path) or []
        return [r["tokenAddress"] for r in rows
                if isinstance(r, dict) and r.get("chainId") == CHAIN and r.get("tokenAddress")]

    def discover_mints(self) -> list:
        """Fresh Solana tokens from DexScreener's public feeds."""
        mints, errors = [], []
        for path in ("/token-profiles/latest/v1", "/token-boosts/latest/v1", "/token-boosts/top/v1"):
            try:
                mints += self._mints_from_feed(path)
            except Exception as e:
                errors.append(e)
        if errors and not mints:
            raise errors[0]
        return list(dict.fromkeys(mints))

    def pairs_for_mints(self, mints: list) -> list:
        """All Solana pairs for the given token mints (30 per request)."""
        out = []
        for chunk in _chunks(list(mints), 30):
            rows = self.http.get_json(f"{BASE}/tokens/v1/{CHAIN}/{','.join(chunk)}") or []
            out += [p for p in (parse_pair(r) for r in rows) if p]
        return out

    def pairs_by_address(self, addresses: list) -> dict:
        """pair_address -> Pair, for live price checks (30 per request)."""
        out = {}
        for chunk in _chunks(list(addresses), 30):
            data = self.http.get_json(f"{BASE}/latest/dex/pairs/{CHAIN}/{','.join(chunk)}") or {}
            for r in data.get("pairs") or []:
                p = parse_pair(r)
                if p:
                    out[p.pair_address] = p
        return out
