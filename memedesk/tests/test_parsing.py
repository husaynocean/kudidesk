import unittest

from memedesk.agents.scout import Scout, ScoutMemory
from memedesk.data.dexscreener import parse_pair
from memedesk.data.safety import lp_locked_pct, past_rugs, top10_pct

from helpers import NOW, make_pair

RAW = {
    "chainId": "solana", "dexId": "raydium", "url": "https://dexscreener.com/solana/x",
    "pairAddress": "PAIR", "baseToken": {"address": "MINT", "symbol": "WIF"},
    "priceUsd": "0.0123", "txns": {"h1": {"buys": 10, "sells": 5}},
    "volume": {"m5": 1, "h1": 60000}, "priceChange": {"m5": 1.5, "h1": 20},
    "liquidity": {"usd": 50000}, "fdv": 900000, "marketCap": 800000,
    "pairCreatedAt": 1_700_000_000_000,
}


class Parsing(unittest.TestCase):
    def test_parse_pair(self):
        p = parse_pair(RAW)
        self.assertEqual((p.mint, p.dex, p.price_usd, p.market_cap_usd), ("MINT", "raydium", 0.0123, 800000))
        self.assertEqual(p.created_at, 1_700_000_000)
        self.assertEqual((p.buys_h1, p.sells_h1), (10, 5))

    def test_parse_rejects_incomplete(self):
        self.assertIsNone(parse_pair({**RAW, "priceUsd": None}))
        self.assertIsNone(parse_pair({**RAW, "chainId": "ethereum"}))
        self.assertIsNone(parse_pair({**RAW, "pairCreatedAt": None}))

    def test_top10_excludes_pool_and_lockers(self):
        report = {
            "knownAccounts": {"VAULT": {"type": "AMM"}, "LOCK": {"type": "LOCKER"}},
            "topHolders": [{"address": "VAULT", "owner": "X", "amount": 500},
                           {"address": "LOCK", "owner": "Y", "amount": 100}]
                          + [{"address": f"H{i}", "owner": f"O{i}", "amount": 10} for i in range(12)],
        }
        self.assertAlmostEqual(top10_pct(report, 1000), 10.0)
        self.assertIsNone(top10_pct({"topHolders": []}, 1000))

    def test_lp_locked_matches_our_pair(self):
        report = {"markets": [{"pubkey": "OTHER", "lp": {"lpLockedPct": 100}},
                              {"pubkey": "PAIR1", "lp": {"lpLockedPct": 12}}]}
        self.assertEqual(lp_locked_pct(report, make_pair()), 12)
        self.assertIsNone(lp_locked_pct({"markets": []}, make_pair()))
        self.assertEqual(lp_locked_pct({}, make_pair(dex="pumpfun")), 100.0)

    def test_past_rugs(self):
        self.assertTrue(past_rugs({"rugged": True}))
        self.assertTrue(past_rugs({"risks": [{"name": "Creator history of rugged tokens"}]}))
        self.assertFalse(past_rugs({"risks": [{"name": "Low liquidity"}]}))


class FakeDex:
    def __init__(self, pairs):
        self.pairs = pairs

    def pairs_for_mints(self, mints):
        return [p for p in self.pairs if p.mint in mints]


class ScoutWindow(unittest.TestCase):
    def scan(self, pairs, now=NOW, memory=None):
        memory = memory or ScoutMemory()
        scout = Scout([lambda: [p.mint for p in pairs]], FakeDex(pairs), memory)
        return scout.scan(now), memory

    def test_window(self):
        pairs = [
            make_pair(mint="OK"),
            make_pair(mint="YOUNG", created_at=NOW - 20 * 60),
            make_pair(mint="OLD", created_at=NOW - 73 * 3600),
            make_pair(mint="SMALL", market_cap_usd=299_000),
            make_pair(mint="BIG", market_cap_usd=21_000_000),
            make_pair(mint="WRONGDEX", dex="orca"),
        ]
        res, mem = self.scan(pairs)
        self.assertEqual([p.mint for p in res.passed], ["OK"])
        self.assertIn("YOUNG", mem.watch)  # re-checked once it ages in

    def test_young_pair_passes_later_once(self):
        pairs = [make_pair(mint="YOUNG", created_at=NOW - 20 * 60)]
        res, mem = self.scan(pairs)
        self.assertEqual(res.passed, ())
        res, mem = self.scan(pairs, now=NOW + 15 * 60, memory=mem)
        self.assertEqual([p.mint for p in res.passed], ["YOUNG"])
        res, mem = self.scan(pairs, now=NOW + 30 * 60, memory=mem)
        self.assertEqual(res.passed, ())

    def test_best_pair_by_liquidity(self):
        pairs = [make_pair(pair_address="THIN", liquidity_usd=50_000),
                 make_pair(pair_address="DEEP", liquidity_usd=500_000)]
        res, _ = self.scan(pairs)
        self.assertEqual(res.passed[0].pair_address, "DEEP")


if __name__ == "__main__":
    unittest.main()
