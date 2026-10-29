import unittest

from memedesk.agents.filter import Filter
from memedesk.models import Kill, Safety, Survivor

from helpers import FakeSafety, make_pair, safe


def run(pair=None, s=None):
    return Filter(FakeSafety(s)).check(pair or make_pair())


class FilterRules(unittest.TestCase):
    def assertKilled(self, verdict, rule, unverifiable=False):
        self.assertIsInstance(verdict, Kill, verdict)
        self.assertEqual(verdict.rule, rule)
        self.assertEqual(verdict.unverifiable, unverifiable)

    def test_clean_pair_survives(self):
        self.assertIsInstance(run(), Survivor)

    def test_rule1_mint_authority(self):
        self.assertKilled(run(s=safe(mint_authority_revoked=False)), 1)

    def test_rule1_freeze_authority(self):
        self.assertKilled(run(s=safe(freeze_authority_revoked=False)), 1)

    def test_rule2_lp_unlocked(self):
        self.assertKilled(run(s=safe(lp_locked_pct=40.0)), 2)

    def test_rule3_liquidity(self):
        self.assertKilled(run(make_pair(liquidity_usd=39_999)), 3)

    def test_rule4_volume(self):
        self.assertKilled(run(make_pair(volume_h1_usd=49_999)), 4)

    def test_rule5_top10(self):
        self.assertKilled(run(s=safe(top10_pct=25.1)), 5)

    def test_rule6_dev_holdings(self):
        self.assertKilled(run(s=safe(dev_pct=3.01)), 6)

    def test_rule6_past_rugs(self):
        self.assertKilled(run(s=safe(dev_past_rugs=True)), 6)

    def test_rule7_bundles(self):
        self.assertKilled(run(s=safe(bundled_pct=10.5)), 7)

    def test_rule8_already_pumped(self):
        self.assertKilled(run(make_pair(price_change_h1_pct=80)), 8)

    def test_boundaries_pass(self):
        s = safe(top10_pct=25.0, dev_pct=3.0, bundled_pct=10.0, lp_locked_pct=95.0)
        p = make_pair(liquidity_usd=40_000, volume_h1_usd=50_000, price_change_h1_pct=79.9)
        self.assertIsInstance(run(p, s), Survivor)

    def test_unknown_is_a_kill(self):
        for field, rule in [("mint_authority_revoked", 1), ("lp_locked_pct", 2), ("top10_pct", 5),
                            ("dev_pct", 6), ("dev_past_rugs", 6), ("bundled_pct", 7)]:
            with self.subTest(field=field):
                self.assertKilled(run(s=safe(**{field: None})), rule, unverifiable=True)

    def test_safety_source_crash_is_a_kill(self):
        class Boom:
            def fetch(self, _):
                raise RuntimeError("down")
        self.assertKilled(Filter(Boom()).check(make_pair()), 1, unverifiable=True)

    def test_cheap_rules_skip_onchain_calls(self):
        fake = FakeSafety()
        Filter(fake).check(make_pair(liquidity_usd=1000))
        self.assertEqual(fake.calls, 0)

    def test_empty_safety_never_passes(self):
        self.assertIsInstance(run(s=Safety()), Kill)


if __name__ == "__main__":
    unittest.main()
