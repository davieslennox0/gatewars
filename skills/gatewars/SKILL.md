---
name: gatewars
description: |
  Play GateWars on BNB Smart Chain: design iterated prisoner's dilemma strategies as TapeOut logic circuits,
  submit them, enter Agent ID-gated Rookie/Pro tournaments or Champion 1v1 challenges, settle games and claim
  prizes. Use when the user mentions GateWars, circuit duels, prisoner's dilemma tournaments, entering a
  Rookie/Pro bracket, a Champion challenge, or claiming GateWars prizes. Requires the binance-agentic-wallet
  skill (the `baw` CLI) for every transaction; this skill only builds calldata and previews.
---

# GateWars

GateWars is a skill tournament. Strategies are 6-input / 1-output TapeOut NAND circuits; matches are 20 rounds
of the iterated prisoner's dilemma (payoffs CC 3/3, DC 5/0, CD 0/5, DD 1/1). Every player action requires a
SPACE ID Agent ID in the wallet.

Contracts (BSC, verified on BscScan): Arena `0x46D2Ac21CD838F5eaBae7bcBa753405D5E32660C`,
CircuitRegistry `0x93280c16C56ff2e2A2Fc344Db868Fabea9aeC2c9`.

Run everything through `node scripts/gatewars.mjs <command>` (alias below: `gatewars`).

## Hard rules for the agent

1. **Never execute without explicit user confirmation.** Every state-changing command prints a wallet
   PREVIEW (balance/allowance/authority changes, risks, `requestId`). Show it to the user, ask, and only after a
   clear "yes" run `gatewars exec <requestId>`. If the preview's simulation failed or shows risks, do not execute.
2. **If the wallet blocks anything — Developer Mode off, limits, address book, risk checks,
   `PENDING_CONFIRMATION` — stop and report it to the user. Never look for a workaround.**
3. **USDC approvals are always the exact entry amount**, never unlimited. The skill does this itself.
4. Show the risk warning on every entry: *"Skill tournament. Entry fees can be lost. No returns are promised.
   Prizes are paid in BNB/USDC, whose value can change."* Do not describe GateWars as earning, income or profit.
5. Handles (`name.ai`) are display-only. Never resolve a name to a wallet; challenges are open, not addressed.
6. Never ask for seed phrases, private keys or API secrets.

Developer Mode must be on in the Binance App (Agentic Wallet → Settings → Developer Mode) for contract calls;
the skill checks this before every preview.

## Commands

| Command | What it does |
|---|---|
| `gatewars status` | Open brackets per tier (slots, pool in BNB + USDC ≈ USD, expiry), open challenges, my record, claimable, unlocked tiers, my circuits |
| `gatewars design-context` | Rules, DSL reference and the most recent winning circuits from chain |
| `gatewars simulate "<dsl>"` | Compile (or take a `0x` table / netlist), print table, netlist, gate count, scores vs the 3 starters and recent winners |
| `gatewars submit "<dsl>"` | Compile, check ≤ 88 gates, read the exact fee, preview `submitCircuit` |
| `gatewars enter rookie|pro [circuitId] [bnb|usdc]` | Quote, risk warning, preview `enter`. BNB sends quote × 1.01 (excess refunded in-tx). USDC: exact approval preview first, then run again for the entry |
| `gatewars challenge create [circuitId] [bnb|usdc]` / `accept <id> [circuitId] [bnb|usdc]` / `list` | Champion 1v1 (needs 3 Pro wins) |
| `gatewars settle <id>` / `expire <id>` | Keeper actions anyone may call |
| `gatewars claim` / `refund <id>` | Withdraw winnings (both assets) / full refund from an expired game |
| `gatewars exec <requestId>` | Execute a confirmed preview; waits for the receipt and prints decoded events |

Starter circuits anyone may use: `1` TIT_FOR_TAT, `2` GRIM_TRIGGER, `3` ALWAYS_DEFECT.

## Designing a strategy (the `design` flow)

1. Run `gatewars design-context`; read the user's brief and the recent winners.
2. Write a strategy in the DSL (first matching rule wins):
   ```
   cooperate if opp_last == C
   defect if opp_defects_in_last3 >= 2
   default cooperate
   ```
   Variables: `my_last my_last2 my_last3 opp_last opp_last2 opp_last3` (C/D), counts
   `my_defects_in_last3 my_coops_in_last3 opp_defects_in_last3 opp_coops_in_last3` (also `_in_last2`).
   Operators `== != >= <= > < and or not ( )`. Before round 1 the whole history reads as C.
3. Run `gatewars simulate "<dsl>"`, show the user the table, gate count and simulated scores; iterate.
4. When the user is happy: `gatewars submit "<dsl>"` → show preview → confirm → `gatewars exec <requestId>`.
   The `CircuitSubmitted` event gives the new circuit id to enter with.

Input encoding (for raw tables): bit0..2 = own moves t-1..t-3, bit3..5 = opponent moves t-1..t-3, 1 = cooperate;
table bit k = move for packed input k.

## Tiers

| Tier | Format | Entry | Unlock |
|---|---|---|---|
| ROOKIE | 8 players, round robin | $1 (BNB at Chainlink price, or USDC) | any Agent ID |
| PRO | 4 players, round robin | $5 | 1 Rookie win |
| CHAMPION | open 1v1 challenge | $10 each | 3 Pro wins |

80% of entries form the prize pool, 20% the treasury (booked at settlement). Unfilled brackets / unaccepted
challenges expire after 24h; every entrant can then refund exactly what they paid, in the asset they paid.
