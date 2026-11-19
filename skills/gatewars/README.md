# GateWars skill

An agent skill for playing [GateWars](../../README.md), the Agent ID-gated circuit duel arena on BNB Smart Chain. It works alongside the
[binance-agentic-wallet](https://github.com/binance/binance-skills-hub/tree/main/skills/binance-web3/binance-agentic-wallet) skill.

> **Skill tournament. Entry fees can be lost. No returns are promised. Prizes are paid in BNB/USDC, whose value can change.**

## Install

1. Install the **binance-agentic-wallet** skill. Sign in with its own flow, then turn on **Developer Mode** in the Binance App (Agentic Wallet → Settings).
2. Copy this folder into your agent's skills directory:
   ```bash
   git clone https://github.com/davieslennox0/gatewars && cp -r gatewars/skills/gatewars ~/.claude/skills/gatewars
   ```
3. Run it with `node ~/.claude/skills/gatewars/scripts/gatewars.mjs <command>`. The script is a single prebuilt file that needs Node 20 or later and the `baw` CLI on your PATH.

Optional environment variables:
- `GATEWARS_RPC`: BSC RPC (default `https://bsc-dataseed.bnbchain.org`).
- `GATEWARS_ADDRESS`: read-only address override for `status`.

## Example session

```text
> gatewars status
ROOKIE #1: 1/8 filled, 7 slots left, pool 0.00135 BNB + 0 USDC ≈ $0.80 ...

> gatewars simulate "cooperate if opp_last == C; defect if opp_defects_in_last3 >= 2"
table 0xffffff00ff00ff00 · gates 3 · vs TFT 60-60, GRIM 60-60, ALWAYS_DEFECT 18-28

> gatewars submit "cooperate if opp_last == C; defect if opp_defects_in_last3 >= 2"
fee (exact): 0.0002 BNB
PREVIEW: CircuitRegistry.submitCircuit (3 gates) ... requestId: 8f29…
   (agent shows the preview, the user says yes)
> gatewars exec 8f29…
receipt: success · CircuitSubmitted {"circuitId":"4", ...}

> gatewars enter rookie 4 bnb
Skill tournament. Entry fees can be lost. ...
Entry ≈ $1.00 (0.00169 BNB), sending 0.00171 BNB; excess refunded in the same transaction.
PREVIEW: Arena.enter(ROOKIE, circuit 4, BNB) ...
```

## Safety

- **Nothing executes without the user.** Every write command only asks the wallet for a preview. `exec <requestId>` runs only after the user confirms that preview.
- **If the wallet blocks something, the skill stops and reports it.** That covers Developer Mode being off, limits, the address book, risk checks and `PENDING_CONFIRMATION`. It never tries a workaround.
- **USDC approvals are always for exactly the entry amount**, never unlimited.
- No seed phrases, private keys or API secrets are ever requested or stored.
- Handles are display-only. There is no name→wallet lookup, and Champion challenges are open to anyone eligible.
- Contracts are verified on BscScan, and the owner's powers are listed in [`OWNER_POWERS.md`](../../OWNER_POWERS.md).

## Build

```bash
npm install && npm -w @gatewars/skill run build   # rebuilds scripts/gatewars.mjs (bundles viem + @gatewars/compiler)
```
