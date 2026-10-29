"""The desk's trading rules.

These are constants on purpose. There is no config key, CLI flag or mode that
changes them: paper and live run the exact same numbers, nothing loosened.
"""
from dataclasses import dataclass


@dataclass(frozen=True)
class Rules:
    # Scout window
    min_pair_age_min: float = 30
    max_pair_age_h: float = 72
    min_mcap_usd: float = 300_000
    max_mcap_usd: float = 20_000_000
    allowed_dexes: tuple = ("pumpfun", "pumpswap", "raydium")

    # Filter kill thresholds
    min_lp_locked_pct: float = 95.0
    min_liquidity_usd: float = 40_000
    min_volume_h1_usd: float = 50_000
    max_top10_pct: float = 25.0
    max_dev_pct: float = 3.0
    max_bundled_pct: float = 10.0
    max_price_change_h1_pct: float = 80.0

    # Analyst
    min_score: int = 70

    # Executor
    max_trade_fraction: float = 0.08

    # Risk
    stop_loss_pct: float = 0.06
    trail_trigger_pct: float = 0.12


RULES = Rules()

FILTER_RULES = {
    1: "mint or freeze authority not revoked",
    2: "LP not burned or locked",
    3: "liquidity under $40k",
    4: "1h volume under $50k",
    5: "top 10 holders own more than 25%",
    6: "dev wallet holds more than 3% or dev has past rugs",
    7: "bundled launch over 10%",
    8: "already up 80%+ in the last hour",
}
