"""LOGGER: every kill with its exact rule, every trade, and the morning recap.

Events go to an append-only JSONL file. The recap is rebuilt from that file, so
it only ever reports what was actually logged.
"""
from __future__ import annotations

import json
import os
import time
from collections import Counter
from typing import Callable, Optional

from ..models import Kill, Pair
from ..rules import FILTER_RULES


class Logger:
    def __init__(self, path: str, session: str, mode: str, clock: Callable[[], float] = time.time):
        self.path = path
        self.session = session
        self.mode = mode
        self.clock = clock
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)

    def _write(self, kind: str, **fields) -> dict:
        ev = {"t": round(self.clock(), 3), "session": self.session, "mode": self.mode, "type": kind, **fields}
        with open(self.path, "a") as f:
            f.write(json.dumps(ev, default=str) + "\n")
        return ev

    def session_start(self, balance: float, open_positions: int):
        return self._write("session_start", balance=round(balance, 4), open_positions=open_positions)

    def session_end(self, balance: float):
        return self._write("session_end", balance=round(balance, 4))

    def scan(self, discovered: int, passed: int):
        return self._write("scan", discovered=discovered, passed=passed)

    def kill(self, pair: Pair, k: Kill):
        return self._write("kill", stage=k.stage, rule=k.rule, reason=k.reason, detail=k.detail,
                           unverifiable=k.unverifiable, mint=pair.mint, symbol=pair.symbol,
                           pair_address=pair.pair_address, url=pair.url)

    def skip(self, pair: Pair, score: float, reason: str):
        return self._write("skip", mint=pair.mint, symbol=pair.symbol, score=score, reason=reason)

    def trade_open(self, pos, components: dict, stop: float):
        return self._write("trade_open", mint=pos.mint, symbol=pos.symbol, pair_address=pos.pair_address,
                           entry_price=pos.entry_price, size_usd=round(pos.cost_usd, 4), qty=pos.qty,
                           score=pos.score, components=components, stop=stop)

    def trade_close(self, trade: dict):
        return self._write("trade_close", **trade)

    def warn(self, msg: str, **fields):
        return self._write("warn", msg=msg, **fields)


def read_events(path: str, session: Optional[str] = None) -> list:
    if not os.path.exists(path):
        return []
    out = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            ev = json.loads(line)
            if session is None or ev.get("session") == session:
                out.append(ev)
    return out


def last_session(path: str) -> Optional[str]:
    evs = [e for e in read_events(path) if e["type"] == "session_start"]
    return evs[-1]["session"] if evs else None


def recap(events: list, book) -> str:
    start = next((e for e in events if e["type"] == "session_start"), None)
    session = start["session"] if start else "?"
    mode = start["mode"] if start else "?"
    scans = [e for e in events if e["type"] == "scan"]
    kills = [e for e in events if e["type"] == "kill"]
    opens = [e for e in events if e["type"] == "trade_open"]
    closes = [e for e in events if e["type"] == "trade_close"]
    skips = [e for e in events if e["type"] == "skip"]
    warns = [e for e in events if e["type"] == "warn"]

    scanned = sum(e["passed"] for e in scans)
    by_rule = Counter((e["rule"], e["unverifiable"]) for e in kills if e["stage"] == "filter")
    analyst_kills = [e for e in kills if e["stage"] == "analyst"]
    wins = [c for c in closes if c["pnl_usd"] > 0]
    losses = [c for c in closes if c["pnl_usd"] <= 0]

    lines = [f"# Morning recap ({mode}) - session {session}", ""]
    lines += [
        f"- Scan cycles: {len(scans)}",
        f"- Pairs scanned (passed by Scout to Filter): {scanned}",
        f"- Killed by Filter: {sum(by_rule.values())}",
        f"- Killed by Analyst (score < 70): {len(analyst_kills)}",
        f"- Scored 70+ but not traded: {len(skips)}",
        f"- Trades opened: {len(opens)}",
        f"- Trades closed: {len(closes)} (W {len(wins)} / L {len(losses)})",
        "",
        "## Kills by rule",
        "",
        "| Rule | Reason | Failed | Unverifiable |",
        "|---|---|---|---|",
    ]
    for rule, name in FILTER_RULES.items():
        lines.append(f"| {rule} | {name} | {by_rule.get((rule, False), 0)} | {by_rule.get((rule, True), 0)} |")
    lines.append(f"| - | Analyst score < 70 | {len(analyst_kills)} | - |")

    if closes:
        best = max(closes, key=lambda c: c["pnl_pct"])
        worst = min(closes, key=lambda c: c["pnl_pct"])
        lines += ["", "## Closed trades", "",
                  "| Coin | Score | Size | Entry | Exit | PnL | Reason |", "|---|---|---|---|---|---|---|"]
        for c in closes:
            lines.append(f"| {c['symbol']} | {c['score']} | ${c['size_usd']:.2f} | {c['entry_price']:.8g} | "
                         f"{c['exit_price']:.8g} | {c['pnl_pct']:+.2f}% (${c['pnl_usd']:+.2f}) | {c['reason']} |")
        lines += ["", f"- Best: {best['symbol']} {best['pnl_pct']:+.2f}%",
                  f"- Worst: {worst['symbol']} {worst['pnl_pct']:+.2f}%"]

    if book.positions:
        lines += ["", "## Still open (exit only on stop or trail)", "",
                  "| Coin | Entry | Last | Stop | Mode | Unrealized |", "|---|---|---|---|---|---|"]
        for p in book.positions.values():
            last = p.last_price if p.last_price is not None else p.entry_price
            u = 100 * (last * p.qty - p.cost_usd) / p.cost_usd
            lines.append(f"| {p.symbol} | {p.entry_price:.8g} | {last:.8g} | {p.stop.price:.8g} | "
                         f"{p.stop.mode} | {u:+.2f}% |")

    realized = sum(c["pnl_usd"] for c in closes)
    lines += ["", "## Balance", "",
              f"- Session start: ${start['balance']:.2f}" if start else "- Session start: ?",
              f"- Realized PnL this session: ${realized:+.2f}",
              f"- Cash: ${book.cash:.2f}",
              f"- Final balance (cash + open positions at last price): ${book.equity():.2f}"]
    if warns:
        lines += ["", f"## Warnings ({len(warns)})", ""]
        for w, n in Counter(w["msg"] for w in warns).most_common(10):
            lines.append(f"- {w} (x{n})")
    return "\n".join(lines) + "\n"
