"""GeckoTerminal: unique buyers/sellers per pool, plus an extra new-pool feed."""
from __future__ import annotations

from ..models import Flow
from .http import Http

BASE = "https://api.geckoterminal.com/api/v2/networks/solana"
HEADERS = {"Accept": "application/json;version=20230302"}


class GeckoTerminal:
    def __init__(self, http: Http):
        self.http = http

    def flow(self, pair_address: str) -> Flow:
        data = self.http.get_json(f"{BASE}/pools/{pair_address}", headers=HEADERS) or {}
        h1 = (((data.get("data") or {}).get("attributes") or {}).get("transactions") or {}).get("h1") or {}
        buyers, sellers = h1.get("buyers"), h1.get("sellers")
        return Flow(
            buyers_h1=int(buyers) if buyers is not None else None,
            sellers_h1=int(sellers) if sellers is not None else None,
        )

    def new_pool_mints(self, pages: int = 3) -> list:
        mints = []
        for page in range(1, pages + 1):
            data = self.http.get_json(f"{BASE}/new_pools?page={page}", headers=HEADERS) or {}
            for pool in data.get("data") or []:
                tid = (((pool.get("relationships") or {}).get("base_token") or {}).get("data") or {}).get("id", "")
                if tid.startswith("solana_"):
                    mints.append(tid[len("solana_"):])
        return list(dict.fromkeys(mints))
