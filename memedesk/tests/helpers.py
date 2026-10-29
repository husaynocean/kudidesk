from dataclasses import replace

from memedesk.models import Flow, Pair, Safety

NOW = 1_800_000_000.0


def make_pair(**kw) -> Pair:
    base = dict(
        mint="MINT1", symbol="TEST", pair_address="PAIR1", dex="pumpswap", url="",
        price_usd=0.001, market_cap_usd=1_000_000, liquidity_usd=150_000,
        volume_m5_usd=15_000, volume_h1_usd=120_000,
        price_change_m5_pct=4, price_change_h1_pct=35, price_change_h6_pct=60,
        buys_h1=900, sells_h1=400, created_at=NOW - 5 * 3600,
    )
    base.update(kw)
    return Pair(**base)


def safe(**kw) -> Safety:
    base = dict(mint_authority_revoked=True, freeze_authority_revoked=True, lp_locked_pct=100.0,
                top10_pct=15.0, dev_pct=0.5, dev_past_rugs=False, bundled_pct=2.0, holders=2000)
    base.update(kw)
    return Safety(**base)


class FakeSafety:
    def __init__(self, s=None, by_mint=None):
        self.s = s or safe()
        self.by_mint = by_mint or {}
        self.calls = 0

    def fetch(self, pair):
        self.calls += 1
        return self.by_mint.get(pair.mint, self.s)


class FakeFlow:
    def __init__(self, f=None):
        self.f = f or Flow(buyers_h1=450, sellers_h1=200)

    def flow(self, _addr):
        return self.f


def strong_flow():
    return FakeFlow(Flow(buyers_h1=450, sellers_h1=200))


__all__ = ["NOW", "make_pair", "safe", "FakeSafety", "FakeFlow", "replace"]
