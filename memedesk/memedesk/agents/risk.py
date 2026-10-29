"""RISK: owns every stop.

  * Stop at -6% is set before the order goes in.
  * Nobody moves a stop lower (Stop.raise_to refuses).
  * After +12% from entry, switch to a trailing stop and let it run.
  * Exit only when the stop or the trail says exit.
"""
from __future__ import annotations

from typing import Callable

from ..book import Book
from ..models import ArmedTicket, ExitSignal, Fill, Position, Stop, Ticket
from ..rules import RULES


class Risk:
    def __init__(self, book: Book, trail_pct: float, clock: Callable[[], float]):
        if not 0 < trail_pct < 1:
            raise ValueError("trail_pct must be between 0 and 1")
        self.book = book
        self.trail_pct = trail_pct
        self.clock = clock

    def arm(self, ticket: Ticket) -> ArmedTicket:
        return ArmedTicket(ticket=ticket, stop=Stop(ticket.ref_price * (1 - RULES.stop_loss_pct)))

    def adopt(self, armed: ArmedTicket, fill: Fill) -> Position:
        stop = armed.stop
        # If we filled above the reference price, lift the stop to -6% of the real
        # entry. If we filled below it, the pre-set stop stays where it is.
        stop.raise_to(max(stop.price, fill.price * (1 - RULES.stop_loss_pct)))
        t = armed.ticket
        pos = Position(mint=t.mint, symbol=t.symbol, pair_address=t.pair_address,
                       entry_price=fill.price, qty=fill.qty, cost_usd=fill.usd, score=t.score,
                       opened_at=self.clock(), stop=stop, peak_price=fill.market_price,
                       last_price=fill.market_price)
        self.book.positions[t.mint] = pos
        return pos

    def update(self, pos: Position, price: float) -> None:
        pos.last_price = price
        pos.peak_price = max(pos.peak_price, price)
        if not pos.trailing and pos.peak_price >= pos.entry_price * (1 + RULES.trail_trigger_pct):
            pos.trailing = True
        if pos.trailing:
            trail = pos.peak_price * (1 - self.trail_pct)
            pos.stop.raise_to(max(pos.stop.price, trail), mode="trail")

    def tick(self, prices: dict) -> list:
        """prices: mint -> latest market price. Returns exit signals."""
        exits = []
        for mint, pos in list(self.book.positions.items()):
            price = prices.get(mint)
            if price is None:
                continue
            self.update(pos, price)
            if price <= pos.stop.price:
                exits.append(ExitSignal(mint=mint, reason="trail" if pos.stop.mode == "trail" else "stop",
                                        trigger_price=price, stop_price=pos.stop.price))
        return exits
