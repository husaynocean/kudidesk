"""Operational settings. Trading rules are NOT here; they live in rules.py."""
from __future__ import annotations

import json
import os
from dataclasses import dataclass, fields


@dataclass(frozen=True)
class Settings:
    data_dir: str = "var"
    rpc_url: str = "https://api.mainnet-beta.solana.com"
    paper_balance_usd: float = 1000.0
    scan_interval_s: float = 90
    monitor_interval_s: float = 15
    # How far below the peak the trailing stop sits once +12% is hit. Not in the
    # original spec, so it is a setting. At 8%, the trail starts at about +3%.
    trail_pct: float = 0.08
    max_open_positions: int = 5
    min_order_usd: float = 5.0
    slippage_bps: float = 50
    fee_bps: float = 30
    smart_wallets_file: str = "smart_wallets.txt"
    geckoterminal_discovery: bool = True

    @classmethod
    def load(cls, path: str = "") -> "Settings":
        data = {}
        if path and os.path.exists(path):
            with open(path) as f:
                data = json.load(f)
        known = {f.name for f in fields(cls)}
        unknown = set(data) - known
        if unknown:
            raise ValueError(f"unknown settings {sorted(unknown)} (trading rules are not configurable)")
        if os.environ.get("SOLANA_RPC_URL"):
            data["rpc_url"] = os.environ["SOLANA_RPC_URL"]
        return cls(**data)


def load_smart_wallets(path: str) -> list:
    if not path or not os.path.exists(path):
        return []
    with open(path) as f:
        rows = [line.split("#")[0].strip() for line in f]
    return [r for r in rows if r][:50]
