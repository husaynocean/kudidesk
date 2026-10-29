import unittest

from memedesk.agents.executor import Executor, Skip
from memedesk.agents.risk import Risk
from memedesk.book import Book
from memedesk.broker import PaperBroker
from memedesk.models import ArmedTicket, Scored, Stop, StopViolation, Ticket

from helpers import NOW, make_pair, safe


def setup(cash=1000.0, slip=0, fee=0, trail=0.08):
    book = Book(start_balance=cash, cash=cash)
    broker = PaperBroker(book, slip, fee)
    return book, Executor(book, broker, max_open_positions=5), Risk(book, trail, lambda: NOW)


def scored(**kw):
    return Scored(pair=make_pair(**kw), safety=safe(), score=80, components={})


def enter(book, ex, risk, price=1.0, liq=10**12, mint="MINT1"):
    t = ex.propose(scored(price_usd=price, mint=mint, pair_address="P" + mint))
    armed = risk.arm(t)
    fill = ex.submit(armed, make_pair(price_usd=price, liquidity_usd=liq, mint=mint, pair_address="P" + mint))
    return risk.adopt(armed, fill)


class StopInvariants(unittest.TestCase):
    def test_stop_never_lowers(self):
        s = Stop(0.94)
        with self.assertRaises(StopViolation):
            s.raise_to(0.90)
        s.raise_to(0.95)
        self.assertEqual(s.price, 0.95)

    def test_stop_set_before_order(self):
        book, ex, risk = setup()
        armed = risk.arm(ex.propose(scored(price_usd=1.0)))
        self.assertAlmostEqual(armed.stop.price, 0.94)
        self.assertEqual(book.positions, {})  # nothing filled yet

    def test_cannot_submit_without_stop(self):
        book, ex, _ = setup()
        t = ex.propose(scored(price_usd=1.0))
        with self.assertRaises(RuntimeError):
            ex.submit(t, make_pair(price_usd=1.0))
        with self.assertRaises(RuntimeError):
            ex.submit(ArmedTicket(t, Stop(1.5)), make_pair(price_usd=1.0))

    def test_stop_lifts_when_fill_is_higher(self):
        book, ex, risk = setup(slip=100)  # 1% slippage
        pos = enter(book, ex, risk, price=1.0)
        self.assertAlmostEqual(pos.stop.price, pos.entry_price * 0.94)
        self.assertGreater(pos.stop.price, 0.94)

    def test_fixed_stop_exit(self):
        book, ex, risk = setup()
        enter(book, ex, risk, price=1.0)
        self.assertEqual(risk.tick({"MINT1": 0.97}), [])
        sig = risk.tick({"MINT1": 0.939})
        self.assertEqual([s.reason for s in sig], ["stop"])

    def test_trailing_after_12pct(self):
        book, ex, risk = setup()
        pos = enter(book, ex, risk, price=1.0)
        risk.tick({"MINT1": 1.11})
        self.assertFalse(pos.trailing)
        self.assertAlmostEqual(pos.stop.price, 0.94)
        risk.tick({"MINT1": 1.121})
        self.assertTrue(pos.trailing)
        self.assertAlmostEqual(pos.stop.price, 1.121 * 0.92)
        risk.tick({"MINT1": 1.50})
        self.assertAlmostEqual(pos.stop.price, 1.50 * 0.92)
        risk.tick({"MINT1": 1.40})  # pullback does not lower the trail
        self.assertAlmostEqual(pos.stop.price, 1.50 * 0.92)
        sig = risk.tick({"MINT1": 1.37})
        self.assertEqual([s.reason for s in sig], ["trail"])

    def test_no_exit_without_stop_hit(self):
        book, ex, risk = setup()
        enter(book, ex, risk, price=1.0)
        for p in (1.0, 0.95, 1.05, 0.941, 1.1):
            self.assertEqual(risk.tick({"MINT1": p}), [])


class ExecutorSizing(unittest.TestCase):
    def test_max_8pct_of_current_balance(self):
        book, ex, risk = setup(cash=1000)
        t = ex.propose(scored())
        self.assertAlmostEqual(t.size_usd, 80.0)
        enter(book, ex, risk, mint="A")
        t2 = ex.propose(scored(mint="B"))
        self.assertAlmostEqual(t2.size_usd, round(920 * 0.08, 2))

    def test_one_entry_per_coin(self):
        book, ex, risk = setup()
        enter(book, ex, risk, mint="A")
        self.assertIsInstance(ex.propose(scored(mint="A")), Skip)
        # still blocked after the position closes: never re-enter, never average down
        sig = risk.tick({"A": 0.5})
        ex.exit(sig[0], make_pair(price_usd=0.5, liquidity_usd=10**12, mint="A"))
        self.assertIsInstance(ex.propose(scored(mint="A")), Skip)

    def test_max_open_positions(self):
        book, ex, risk = setup()
        for m in "ABCDE":
            enter(book, ex, risk, mint=m)
        self.assertIsInstance(ex.propose(scored(mint="F")), Skip)

    def test_paper_fill_costs_slippage_and_fees(self):
        book, ex, risk = setup(slip=50, fee=30)
        pos = enter(book, ex, risk, price=1.0, liq=200_000)
        self.assertGreater(pos.entry_price, 1.0)
        self.assertAlmostEqual(book.cash, 920.0)
        sig = risk.tick({"MINT1": 0.93})
        trade = ex.exit(sig[0], make_pair(price_usd=0.93, liquidity_usd=200_000))
        self.assertLess(trade["pnl_pct"], -6.0)  # real exits are worse than the stop
        self.assertEqual(book.positions, {})


if __name__ == "__main__":
    unittest.main()
