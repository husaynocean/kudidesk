"""The balance, open positions, and the set of coins already entered."""
from __future__ import annotations

import json
import os
from dataclasses import dataclass, field

from .models import Position


@dataclass
class Book:
    start_balance: float
    cash: float
    positions: dict = field(default_factory=dict)  # mint -> Position
    traded: set = field(default_factory=set)  # every mint ever entered: one entry per coin

    def equity(self) -> float:
        marks = sum(p.qty * (p.last_price if p.last_price is not None else p.entry_price)
                    for p in self.positions.values())
        return self.cash + marks

    def to_dict(self) -> dict:
        return {
            "start_balance": self.start_balance,
            "cash": self.cash,
            "positions": {m: p.to_dict() for m, p in self.positions.items()},
            "traded": sorted(self.traded),
        }

    @classmethod
    def from_dict(cls, d: dict) -> "Book":
        return cls(
            start_balance=d["start_balance"],
            cash=d["cash"],
            positions={m: Position.from_dict(p) for m, p in d.get("positions", {}).items()},
            traded=set(d.get("traded", [])),
        )


def save_state(path: str, state: dict) -> None:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(state, f, indent=2)
    os.replace(tmp, path)


def load_state(path: str):
    if not os.path.exists(path):
        return None
    with open(path) as f:
        return json.load(f)
