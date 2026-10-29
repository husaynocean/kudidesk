# memedesk: Solana memecoin desk

Six agents with hard handoffs. Protecting the balance comes first, profit second.
Pure Python 3.10+ standard library: no dependencies, no API keys needed for paper mode.

```
SCOUT ──Pair──▶ FILTER ──Survivor──▶ ANALYST ──Scored──▶ EXECUTOR.propose ──Ticket──▶ RISK.arm
                  │ Kill                 │ Kill (<70)                                    │ ArmedTicket (stop at −6%)
                  ▼                      ▼                                               ▼
                LOGGER ◀───────────────────────────────── trade_open ◀── RISK.adopt ◀── EXECUTOR.submit
                  ▲                                                                       
                  └── trade_close ◀── EXECUTOR.exit ◀── ExitSignal ◀── RISK.tick (every 15 s)
```

Every handoff is a frozen dataclass, so no agent can edit another's output. Executor
will not submit an order without a stop that Risk armed. `Stop.raise_to` raises an
error on any attempt to lower a stop.

## Agents

| Agent | Does | Data |
|---|---|---|
| **Scout** | Pairs 30 min–72 h old, mcap $300k–$20M, on Pump.fun / PumpSwap / Raydium. Young pairs are watchlisted and passed once they age in. Each coin is passed once. | DexScreener (+ GeckoTerminal new-pools feed for discovery) |
| **Filter** | 8 kill rules (below). One hit = dead. **A fact that can't be verified is a hit.** | Solana RPC, RugCheck, trench.bot |
| **Analyst** | Scores 0–100, only 70+ passes. Missing data scores 0. | DexScreener, GeckoTerminal, RPC |
| **Executor** | 8% of current cash per trade, one entry per coin ever, no averaging down, max 5 open (setting). | – |
| **Risk** | Stop at −6% before the order goes in. Never lowered. At +12%, switches to a trailing stop 8% under the peak (setting). Exits only on stop or trail. | DexScreener prices |
| **Logger** | Every kill with its exact rule, every trade, morning recap. | `var/<mode>/events.jsonl` |

### Filter rules (`memedesk/rules.py`, constants, not configurable)

1. Mint or freeze authority not revoked (RPC `getAccountInfo`)
2. LP not burned or locked (< 95% locked/burned on *this* pair per RugCheck; pump.fun bonding curve counts as locked)
3. Liquidity under $40k
4. 1h volume under $50k
5. Top 10 holders own more than 25% (pool vaults and lockers excluded, against on-chain supply)
6. Dev wallet holds more than 3% (RPC balance of the creator) or dev has past rugs (RugCheck flags)
7. Bundled launch over 10% (trench.bot)
8. Already up 80%+ in the last hour

Rules 3, 4 and 8 run first because they cost no extra API calls. A pair hit by several
rules is logged under the first one checked.

### Analyst score

| Component | Max | 0 points at | full points at |
|---|---|---|---|
| Momentum: 1h change, 5m change, 5m volume vs 1h pace | 20 | flat/negative | +40% 1h, +5% 5m, 1.5× pace |
| Unique buyers (1h, distinct wallets) | 15 | 50 | 400 |
| Buy/sell ratio (unique buyers/sellers) | 20 | 1.0 | 2.0 |
| Holder growth (holders per hour since pair creation) | 15 | 25/h | 400/h |
| Liquidity / mcap | 15 | 4% | 15% |
| Smart wallets holding (from `smart_wallets.txt`) | 15 | 0 | 3+ |

With no smart-wallet list the max is 85, so a coin needs 70 of the other 85.

## Run it

```bash
cd memedesk
python -m memedesk run --hours 8          # paper, overnight. Writes var/paper/recap-<session>.md
python -m memedesk recap                  # rebuild the last recap from the event log
python -m memedesk status                 # cash, equity, open positions and their stops
python -m unittest discover -s tests -t tests
```

Overnight without babysitting: `nohup python -m memedesk run --hours 8 > /dev/null 2>&1 &`.
No notifications are sent. Read the recap in the morning.

Open positions are saved to `var/paper/state.json` and survive restarts. They are only
closed by a stop or trail, so if the run ends with something open, the next run picks it
up and keeps watching its stop.

### Settings (`memedesk.json`, optional)

See `memedesk.example.json`. Only operational knobs live there: RPC URL (or `SOLANA_RPC_URL`),
paper balance, intervals, trail distance, max open positions, paper slippage/fees. Unknown
keys are rejected, so a trading rule can't be loosened by config by accident.

A paid RPC (Helius, Triton, QuickNode…) is recommended. The public endpoint rate-limits hard.

### Network hosts it needs

`api.dexscreener.com`, `api.geckoterminal.com`, `api.rugcheck.xyz`, `trench.bot`, and your Solana RPC host.

## Paper first, then live

Paper fills use the live DexScreener price at order time, plus 0.5% slippage, plus
constant-product price impact against the pool, plus 0.3% fees, on both sides. Stops trigger
on observed prices, so a gap down exits *worse* than −6%, and the logs will show it.

**Live is deliberately not wired up yet.** `--mode live` refuses to start. Once the paper
logs look clean, live needs a `LiveBroker` (Jupiter swap + wallet signing) behind the same
`buy`/`sell` interface in `broker.py`. Nothing else changes: the rules are the same constants.

### What to check in the first paper recap

- **Unverifiable column.** If one rule kills almost everything as *unverifiable*, a data
  source is down or its response format changed (RugCheck and trench.bot are unofficial
  free APIs). The desk is failing closed. Fix the source, don't loosen the rule.
- **Warnings section.** It lists data-source failures and positions with no price.
- **Rule 6 details.** Dev rug history relies on RugCheck's `risks` / `creatorTokens`
  flags. Spot-check a few kills by hand.
- **Holder growth** is holders ÷ pair age. For PumpSwap pairs, age counts from graduation, so
  coins that graduated recently get a higher growth score.

## Running inside Claude

The desk is a plain CLI, so you can drive it from any Claude Code session: ask Claude to
start `python -m memedesk run --hours 8` in the background and summarize the recap in the
morning, or schedule it as a Routine. To export it, copy the `memedesk/` folder: it has no
dependencies.

Not financial advice. Memecoins can go to zero between two price checks.
