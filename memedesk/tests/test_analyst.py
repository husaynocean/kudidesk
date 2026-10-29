import unittest

from memedesk.agents.analyst import Analyst, score
from memedesk.models import Flow, Kill, Scored, Survivor

from helpers import NOW, FakeFlow, make_pair, safe


def assess(pair=None, s=None, flow=None, smart=2):
    a = Analyst(FakeFlow(flow), lambda _m: smart, lambda: NOW)
    return a.assess(Survivor(pair or make_pair(), s or safe()))


class AnalystScoring(unittest.TestCase):
    def test_components_bounded(self):
        comps = score(make_pair(), 10**6, Flow(10**6, 1), 10, NOW)
        maxes = {"momentum": 20, "unique_buyers": 15, "buy_sell": 20, "holder_growth": 15,
                 "liq_mcap": 15, "smart_wallets": 15}
        self.assertEqual(sum(maxes.values()), 100)
        for k, v in comps.items():
            self.assertLessEqual(v, maxes[k], k)
            self.assertGreaterEqual(v, 0, k)

    def test_strong_coin_passes(self):
        r = assess()
        self.assertIsInstance(r, Scored)
        self.assertGreaterEqual(r.score, 70)

    def test_weak_coin_dies(self):
        r = assess(make_pair(price_change_h1_pct=-5, price_change_m5_pct=-2, liquidity_usd=45_000,
                             buys_h1=300, sells_h1=310), flow=Flow(60, 70), smart=0)
        self.assertIsInstance(r, Kill)
        self.assertEqual(r.stage, "analyst")
        self.assertIn("score", r.detail)

    def test_missing_data_scores_zero(self):
        comps = score(make_pair(sells_h1=0), None, Flow(), 0, NOW)
        self.assertEqual(comps["unique_buyers"], 0)
        self.assertEqual(comps["holder_growth"], 0)
        self.assertEqual(comps["buy_sell"], 0)

    def test_flow_failure_does_not_crash(self):
        class Boom:
            def flow(self, _):
                raise RuntimeError("down")
        a = Analyst(Boom(), lambda _m: 0, lambda: NOW)
        self.assertIsInstance(a.assess(Survivor(make_pair(), safe())), (Kill, Scored))


if __name__ == "__main__":
    unittest.main()
