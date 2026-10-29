"""CLI.

  python -m memedesk run --hours 8          # paper, overnight
  python -m memedesk recap                  # rebuild the last session's recap
  python -m memedesk status                 # balance and open positions
"""
from __future__ import annotations

import argparse
import logging
import os
import sys
import time

from .agents.analyst import Analyst
from .agents.executor import Executor
from .agents.filter import Filter
from .agents.logger import Logger, last_session, read_events, recap
from .agents.risk import Risk
from .agents.scout import Scout, ScoutMemory
from .book import Book, load_state, save_state
from .broker import LiveBroker, PaperBroker
from .config import Settings, load_smart_wallets
from .data.dexscreener import DexScreener
from .data.geckoterminal import GeckoTerminal
from .data.http import Http
from .data.safety import OnChainSafety
from .data.solana_rpc import SolanaRPC
from .desk import Desk


def paths(s: Settings, mode: str):
    root = os.path.join(s.data_dir, mode)
    return os.path.join(root, "state.json"), os.path.join(root, "events.jsonl"), root


def load_book_and_memory(s: Settings, mode: str):
    state_path, _, _ = paths(s, mode)
    st = load_state(state_path)
    if st:
        return Book.from_dict(st["book"]), ScoutMemory.from_dict(st.get("scout", {}))
    return Book(start_balance=s.paper_balance_usd, cash=s.paper_balance_usd), ScoutMemory()


def build(s: Settings, mode: str) -> Desk:
    state_path, events_path, _ = paths(s, mode)
    book, memory = load_book_and_memory(s, mode)
    http = Http(pacing={_host(s.rpc_url): 0.15})
    dex = DexScreener(http)
    gecko = GeckoTerminal(http)
    rpc = SolanaRPC(http, s.rpc_url)
    smart = load_smart_wallets(s.smart_wallets_file)

    def smart_count(mint: str) -> int:
        return sum(1 for w in smart if rpc.wallet_token_balance(w, mint) > 0)

    sources = [dex.discover_mints]
    if s.geckoterminal_discovery:
        sources.append(gecko.new_pool_mints)

    broker = PaperBroker(book, s.slippage_bps, s.fee_bps) if mode == "paper" else LiveBroker()
    session = time.strftime("%Y%m%d-%H%M%S")

    def save():
        save_state(state_path, {"book": book.to_dict(), "scout": memory.to_dict()})

    return Desk(
        scout=Scout(sources, dex, memory),
        filter=Filter(OnChainSafety(http, rpc)),
        analyst=Analyst(gecko, smart_count, time.time),
        executor=Executor(book, broker, s.max_open_positions, s.min_order_usd),
        risk=Risk(book, s.trail_pct, time.time),
        logger=Logger(events_path, session, mode),
        book=book,
        quotes=dex.pairs_by_address,
        save=save,
        scan_interval=s.scan_interval_s,
        monitor_interval=s.monitor_interval_s,
    )


def _host(url: str) -> str:
    from urllib.parse import urlparse
    return urlparse(url).hostname or ""


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="memedesk")
    ap.add_argument("--config", default="memedesk.json")
    sub = ap.add_subparsers(dest="cmd", required=True)
    run = sub.add_parser("run")
    run.add_argument("--hours", type=float, default=8)
    run.add_argument("--mode", choices=["paper", "live"], default="paper")
    for name in ("recap", "status"):
        p = sub.add_parser(name)
        p.add_argument("--mode", choices=["paper", "live"], default="paper")
        if name == "recap":
            p.add_argument("--session")
    args = ap.parse_args(argv)

    s = Settings.load(args.config)
    state_path, events_path, root = paths(s, args.mode)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s",
                        handlers=[logging.FileHandler(_ensure(root, "desk.log")), logging.StreamHandler()])

    if args.cmd == "run":
        desk = build(s, args.mode)
        text = desk.run(args.hours)
        out = os.path.join(root, f"recap-{desk.logger.session}.md")
        with open(out, "w") as f:
            f.write(text)
        print(text)
        print(f"recap written to {out}")
        return 0

    book, _ = load_book_and_memory(s, args.mode)
    if args.cmd == "recap":
        session = args.session or last_session(events_path)
        if not session:
            print("no sessions logged yet")
            return 1
        print(recap(read_events(events_path, session), book))
        return 0

    print(f"cash ${book.cash:.2f}  equity ${book.equity():.2f}  open {len(book.positions)}  "
          f"coins entered {len(book.traded)}")
    for p in book.positions.values():
        print(f"  {p.symbol:10} entry {p.entry_price:.8g}  stop {p.stop.price:.8g} ({p.stop.mode})")
    return 0


def _ensure(root: str, name: str) -> str:
    os.makedirs(root, exist_ok=True)
    return os.path.join(root, name)


if __name__ == "__main__":
    sys.exit(main())
