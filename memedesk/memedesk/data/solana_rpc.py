"""Direct Solana RPC reads: mint authorities, supply, wallet balances."""
from __future__ import annotations

from typing import Optional

from .http import Http


class SolanaRPC:
    def __init__(self, http: Http, url: str):
        self.http = http
        self.url = url

    def _call(self, method: str, params: list):
        res = self.http.post_json(self.url, {"jsonrpc": "2.0", "id": 1, "method": method, "params": params})
        if not isinstance(res, dict) or "error" in res:
            raise RuntimeError(f"rpc {method} failed: {res and res.get('error')}")
        return res.get("result")

    def mint_info(self, mint: str) -> Optional[dict]:
        """{mint_authority, freeze_authority, supply (raw int), decimals} or None."""
        res = self._call("getAccountInfo", [mint, {"encoding": "jsonParsed"}])
        info = ((((res or {}).get("value") or {}).get("data") or {}).get("parsed") or {}).get("info")
        if not info or "supply" not in info:
            return None
        return {
            "mint_authority": info.get("mintAuthority"),
            "freeze_authority": info.get("freezeAuthority"),
            "supply": int(info["supply"]),
            "decimals": int(info.get("decimals", 0)),
        }

    def wallet_token_balance(self, owner: str, mint: str) -> int:
        """Raw token amount `owner` holds of `mint` across all its token accounts."""
        res = self._call("getTokenAccountsByOwner", [owner, {"mint": mint}, {"encoding": "jsonParsed"}])
        total = 0
        for acc in (res or {}).get("value") or []:
            amt = (((((acc.get("account") or {}).get("data") or {}).get("parsed") or {})
                    .get("info") or {}).get("tokenAmount") or {}).get("amount")
            total += int(amt or 0)
        return total
