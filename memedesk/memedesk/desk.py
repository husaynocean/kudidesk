"""The desk: runs the six agents in a fixed order with hard handoffs.

Scout -> Filter -> Analyst -> Executor (propose) -> Risk (arm stop)
      -> Executor (submit) -> Risk (adopt, own the stop) -> Logger

Each agent only receives the previous agent's output. Risk is ticked between
candidates and on its own interval so open positions are never left unwatched
for long while a scan is busy.
"""
from __future__ import annotations

import logging
import time
from typing import Callable

from .agents.analyst import Analyst
from .agents.executor import Executor, Skip
from .agents.filter import Filter
from .agents.logger import Logger, read_events, recap
from .agents.risk import Risk
from .agents.scout import Scout
from .book import Book
from .models import Kill, Pair

log = logging.getLogger(__name__)


class Desk:
    def __init__(self, *, scout: Scout, filter: Filter, analyst: Analyst, executor: Executor,
                 risk: Risk, logger: Logger, book: Book, quotes: Callable[[list], dict],
                 save: Callable[[], None], clock: Callable[[], float] = time.time,
                 sleep: Callable[[float], None] = time.sleep,
                 scan_interval: float = 90, monitor_interval: float = 15):
        self.scout, self.filter, self.analyst = scout, filter, analyst
        self.executor, self.risk, self.logger = executor, risk, logger
        self.book = book
        self.quotes = quotes  # list[pair_address] -> {pair_address: Pair}
        self.save = save
        self.clock, self.sleep = clock, sleep
        self.scan_interval, self.monitor_interval = scan_interval, monitor_interval
        self._next_monitor = 0.0

    # --- one candidate through the pipeline -------------------------------
    def process(self, pair: Pair) -> None:
        verdict = self.filter.check(pair)
        if isinstance(verdict, Kill):
            self.logger.kill(pair, verdict)
            return

        scored = self.analyst.assess(verdict)
        if isinstance(scored, Kill):
            self.logger.kill(pair, scored)
            return

        ticket = self.executor.propose(scored)
        if isinstance(ticket, Skip):
            self.logger.skip(pair, scored.score, ticket.reason)
            return

        armed = self.risk.arm(ticket)
        quote = self._fresh_quote(pair)
        if quote is None:
            self.logger.skip(pair, scored.score, "no fresh quote at order time")
            return
        if quote.price_usd <= armed.stop.price:
            self.logger.skip(pair, scored.score, "price already at or below the stop at order time")
            return
        try:
            fill = self.executor.submit(armed, quote)
        except Exception as e:
            self.logger.warn("order failed", mint=pair.mint, error=str(e))
            return
        pos = self.risk.adopt(armed, fill)
        self.logger.trade_open(pos, scored.components, pos.stop.price)
        self.save()

    def _fresh_quote(self, pair: Pair):
        try:
            return self.quotes([pair.pair_address]).get(pair.pair_address)
        except Exception as e:
            self.logger.warn("quote failed", mint=pair.mint, error=str(e))
            return None

    # --- risk loop -------------------------------------------------------
    def monitor(self) -> None:
        self._next_monitor = self.clock() + self.monitor_interval
        if not self.book.positions:
            return
        by_addr = {p.pair_address: p.mint for p in self.book.positions.values()}
        try:
            quotes = self.quotes(list(by_addr))
        except Exception as e:
            self.logger.warn("price feed failed", error=str(e))
            return
        for addr, mint in by_addr.items():
            if addr not in quotes:
                self.logger.warn("no price for open position", mint=mint)
        prices = {by_addr[a]: q.price_usd for a, q in quotes.items() if a in by_addr}
        for signal in self.risk.tick(prices):
            quote = quotes[self.book.positions[signal.mint].pair_address]
            trade = self.executor.exit(signal, quote)
            if trade:
                self.logger.trade_close(trade)
        self.save()

    def monitor_if_due(self) -> None:
        if self.clock() >= self._next_monitor:
            self.monitor()

    # --- scan loop -------------------------------------------------------
    def scan_cycle(self) -> None:
        result = self.scout.scan(self.clock())
        self.logger.scan(result.discovered, len(result.passed))
        for err in result.errors:
            self.logger.warn("scout data source failed", error=err)
        for pair in result.passed:
            try:
                self.process(pair)
            except Exception as e:
                log.exception("pipeline error on %s", pair.mint)
                self.logger.warn("pipeline error", mint=pair.mint, error=str(e))
            self.monitor_if_due()
        self.save()

    def run(self, hours: float) -> str:
        end = self.clock() + hours * 3600
        self.logger.session_start(self.book.equity(), len(self.book.positions))
        next_scan = 0.0
        try:
            while self.clock() < end:
                self.monitor_if_due()
                if self.clock() >= next_scan:
                    next_scan = self.clock() + self.scan_interval
                    try:
                        self.scan_cycle()
                    except Exception as e:
                        log.exception("scan failed")
                        self.logger.warn("scan failed", error=str(e))
                self.sleep(1)
        except KeyboardInterrupt:
            self.logger.warn("stopped by user")
        finally:
            self.save()
            self.logger.session_end(self.book.equity())
        return recap(read_events(self.logger.path, self.logger.session), self.book)
