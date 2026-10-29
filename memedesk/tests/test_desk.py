"""End-to-end paper night against scripted market data (no network)."""
import os
import tempfile
import unittest

from memedesk.agents.analyst import Analyst
from memedesk.agents.executor import Executor
from memedesk.agents.filter import Filter
from memedesk.agents.logger import Logger, read_events
from memedesk.agents.risk import Risk
from memedesk.agents.scout import Scout, ScoutMemory
from memedesk.book import Book
from memedesk.broker import PaperBroker
from memedesk.desk import Desk

from helpers import NOW, FakeFlow, FakeSafety, make_pair, replace, safe


class Clock:
    def __init__(self, t):
        self.t = t

    def __call__(self):
        return self.t

    def sleep(self, s):
        self.t += s


class Market:
    """Scripted prices per pair address, indexed by elapsed seconds."""

    def __init__(self, pairs, paths, clock):
        self.pairs = {p.pair_address: p for p in pairs}
        self.paths = paths
        self.clock = clock

    def price(self, addr):
        path = self.paths.get(addr)
        if not path:
            return self.pairs[addr].price_usd
        elapsed = self.clock() - NOW
        last = path[0][1]
        for t, px in path:
            if elapsed >= t:
                last = px
        return last

    def pairs_for_mints(self, mints):
        return [replace(p, price_usd=self.price(p.pair_address)) for p in self.pairs.values() if p.mint in mints]

    def quotes(self, addrs):
        return {a: replace(self.pairs[a], price_usd=self.price(a)) for a in addrs if a in self.pairs}


class PaperNight(unittest.TestCase):
    def test_full_night(self):
        clock = Clock(NOW)
        winner = make_pair(mint="WIN", symbol="WIN", pair_address="PWIN", price_usd=1.0, liquidity_usd=10**9)
        loser = make_pair(mint="LOSE", symbol="LOSE", pair_address="PLOSE", price_usd=1.0, liquidity_usd=10**9)
        rug = make_pair(mint="RUG", symbol="RUG", pair_address="PRUG")
        thin = make_pair(mint="THIN", symbol="THIN", pair_address="PTHIN", liquidity_usd=10_000)
        weak = make_pair(mint="WEAK", symbol="WEAK", pair_address="PWEAK", price_change_h1_pct=-3,
                         price_change_m5_pct=-1, buys_h1=100, sells_h1=200, liquidity_usd=45_000)
        pairs = [winner, loser, rug, thin, weak]
        market = Market(pairs, {
            "PWIN": [(0, 1.0), (600, 1.2), (1200, 1.6), (1800, 1.45)],
            "PLOSE": [(0, 1.0), (600, 0.97), (1200, 0.90)],
        }, clock)

        book = Book(start_balance=1000, cash=1000)
        memory = ScoutMemory()
        tmp = tempfile.mkdtemp()
        logger = Logger(os.path.join(tmp, "events.jsonl"), "s1", "paper", clock)
        safety = FakeSafety(safe(), by_mint={"RUG": safe(mint_authority_revoked=False)})

        class WeakFlow(FakeFlow):
            def flow(self, addr):
                from memedesk.models import Flow
                return Flow(40, 90) if addr == "PWEAK" else super().flow(addr)

        desk = Desk(
            scout=Scout([lambda: [p.mint for p in pairs]], market, memory),
            filter=Filter(safety),
            analyst=Analyst(WeakFlow(), lambda m: 0 if m == "WEAK" else 2, clock),
            executor=Executor(book, PaperBroker(book, 0, 0)),
            risk=Risk(book, 0.08, clock),
            logger=logger, book=book, quotes=market.quotes, save=lambda: None,
            clock=clock, sleep=clock.sleep, scan_interval=90, monitor_interval=15,
        )
        text = desk.run(hours=1)
        events = read_events(logger.path, "s1")

        kills = {e["mint"]: e for e in events if e["type"] == "kill"}
        self.assertEqual(kills["RUG"]["rule"], 1)
        self.assertEqual(kills["THIN"]["rule"], 3)
        self.assertEqual(kills["WEAK"]["stage"], "analyst")

        closes = {e["mint"]: e for e in events if e["type"] == "trade_close"}
        self.assertEqual(closes["LOSE"]["reason"], "stop")
        self.assertEqual(closes["WIN"]["reason"], "trail")
        self.assertGreater(closes["WIN"]["pnl_pct"], 30)
        self.assertEqual(sum(e["type"] == "trade_open" for e in events), 2)  # each coin entered once
        self.assertEqual(book.positions, {})

        for needle in ("Pairs scanned (passed by Scout to Filter): 5", "W 1 / L 1",
                       "Best: WIN", "Worst: LOSE", "Final balance"):
            self.assertIn(needle, text)

    def test_empty_night_is_fine(self):
        clock = Clock(NOW)
        market = Market([make_pair(liquidity_usd=1)], {}, clock)
        book = Book(start_balance=1000, cash=1000)
        tmp = tempfile.mkdtemp()
        desk = Desk(
            scout=Scout([lambda: ["MINT1"]], market, ScoutMemory()),
            filter=Filter(FakeSafety()), analyst=Analyst(FakeFlow(), lambda _: 0, clock),
            executor=Executor(book, PaperBroker(book)), risk=Risk(book, 0.08, clock),
            logger=Logger(os.path.join(tmp, "e.jsonl"), "s", "paper", clock), book=book,
            quotes=market.quotes, save=lambda: None, clock=clock, sleep=clock.sleep,
        )
        text = desk.run(hours=0.5)
        self.assertIn("Trades opened: 0", text)
        self.assertEqual(book.cash, 1000)


if __name__ == "__main__":
    unittest.main()
