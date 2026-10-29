"""Order routing. Paper fills against live DexScreener prices; live is not wired up."""
from __future__ import annotations

from typing import Protocol

from .book import Book
from .models import Fill, Pair, Position, Ticket


class Broker(Protocol):
    mode: str
    def buy(self, ticket: Ticket, quote: Pair) -> Fill: ...
    def sell(self, position: Position, quote: Pair) -> Fill: ...


def price_impact(usd: float, liquidity_usd: float) -> float:
    """Constant-product approximation: trade size against the quote side of the pool."""
    side = liquidity_usd / 2
    if side <= 0:
        return 1.0
    return usd / side


class PaperBroker:
    """Simulated fills: market price, plus base slippage, plus pool price impact, plus fees."""

    mode = "paper"

    def __init__(self, book: Book, slippage_bps: float = 50, fee_bps: float = 30):
        self.book = book
        self.slip = slippage_bps / 10_000
        self.fee = fee_bps / 10_000

    def buy(self, ticket: Ticket, quote: Pair) -> Fill:
        usd = ticket.size_usd
        if usd > self.book.cash + 1e-9:
            raise ValueError("insufficient cash")
        eff = quote.price_usd * (1 + self.slip + price_impact(usd, quote.liquidity_usd))
        fees = usd * self.fee
        qty = (usd - fees) / eff
        self.book.cash -= usd
        return Fill(price=eff, qty=qty, usd=usd, fees_usd=fees, market_price=quote.price_usd)

    def sell(self, position: Position, quote: Pair) -> Fill:
        gross = position.qty * quote.price_usd
        haircut = max(0.0, 1 - self.slip - price_impact(gross, quote.liquidity_usd))
        eff = quote.price_usd * haircut
        before_fees = position.qty * eff
        fees = before_fees * self.fee
        proceeds = before_fees - fees
        self.book.cash += proceeds
        return Fill(price=eff, qty=position.qty, usd=proceeds, fees_usd=fees, market_price=quote.price_usd)


class LiveBroker:
    """Placeholder. Live trading needs a Jupiter swap route plus wallet signing,
    and it should only be enabled after paper logs look clean."""

    mode = "live"

    def __init__(self, *_, **__):
        raise NotImplementedError(
            "Live trading is not wired up yet. Run paper mode until the logs look clean, "
            "then add a Jupiter-based LiveBroker with the same buy/sell interface. "
            "The rules are constants in rules.py and are identical in both modes."
        )
