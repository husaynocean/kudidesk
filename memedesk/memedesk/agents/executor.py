"""EXECUTOR: sizes and places orders. Max 8% of current balance, one entry per coin.

The Executor can propose a ticket, but it cannot submit one until Risk has armed
it with a stop. It never adds to a position and never touches a stop.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Union

from ..book import Book
from ..broker import Broker
from ..models import ArmedTicket, ExitSignal, Fill, Pair, Position, Scored, Ticket
from ..rules import RULES


@dataclass(frozen=True)
class Skip:
    reason: str


class Executor:
    def __init__(self, book: Book, broker: Broker, max_open_positions: int = 5, min_order_usd: float = 5.0):
        self.book = book
        self.broker = broker
        self.max_open = max_open_positions
        self.min_order = min_order_usd

    def propose(self, s: Scored) -> Union[Ticket, Skip]:
        if s.pair.mint in self.book.traded:
            return Skip("already entered this coin once")
        if len(self.book.positions) >= self.max_open:
            return Skip(f"{self.max_open} positions already open")
        size = round(self.book.cash * RULES.max_trade_fraction, 2)
        if size < self.min_order:
            return Skip(f"size ${size:.2f} under ${self.min_order:.2f} minimum")
        return Ticket(mint=s.pair.mint, symbol=s.pair.symbol, pair_address=s.pair.pair_address,
                      ref_price=s.pair.price_usd, size_usd=size, score=s.score)

    def submit(self, armed: ArmedTicket, quote: Pair) -> Fill:
        if not isinstance(armed, ArmedTicket) or armed.stop.price >= armed.ticket.ref_price:
            raise RuntimeError("no order goes in without a stop below entry")
        t = armed.ticket
        if t.mint in self.book.traded:
            raise RuntimeError("one entry per coin")
        if t.size_usd > self.book.cash * RULES.max_trade_fraction + 0.01:
            raise RuntimeError("ticket exceeds 8% of current balance")
        fill = self.broker.buy(t, quote)
        self.book.traded.add(t.mint)
        return fill

    def exit(self, signal: ExitSignal, quote: Pair) -> Optional[dict]:
        pos: Position = self.book.positions.get(signal.mint)
        if pos is None:
            return None
        fill = self.broker.sell(pos, quote)
        del self.book.positions[signal.mint]
        pnl = fill.usd - pos.cost_usd
        return {
            "mint": pos.mint, "symbol": pos.symbol, "pair_address": pos.pair_address,
            "score": pos.score, "entry_price": pos.entry_price, "size_usd": pos.cost_usd,
            "exit_price": fill.price, "market_exit_price": fill.market_price,
            "proceeds_usd": round(fill.usd, 4), "pnl_usd": round(pnl, 4),
            "pnl_pct": round(100 * pnl / pos.cost_usd, 2),
            "reason": signal.reason, "stop_price": signal.stop_price,
            "peak_price": pos.peak_price, "opened_at": pos.opened_at,
        }
