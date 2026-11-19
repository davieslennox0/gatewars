# GateWars — Phase 1 gas report

Source: `forge test --match-path test/Fork.t.sol -vv`. These tests run on a BSC mainnet fork against the real TapeOut, Agent ID, Chainlink and USDC contracts. The raw lines are the `GAS …` entries in `phase1/test-results.txt`.

Figures are **execution gas**, measured with `gasleft()` around the external call. A real transaction adds 21,000 intrinsic gas plus calldata: about 22–35k, or about $0.001.

USD uses BSC `eth_gasPrice` = 0.05 gwei and Chainlink BNB/USD = $590.69, both read on the fork on 2026-11-19. At that price, 1M gas = $0.0295.

| Action | Gas | USD (gas) | Notes |
|---|---|---|---|
| `submitCircuit`, 2-gate (TFT) | 1,417,334 | $0.042 | Plus 0.0002 BNB TapeOut fee passthrough ($0.118). Tape-out + 64 × `eval` + storage |
| `submitCircuit`, 88-gate (`MAX_GATES`) | 14,057,314 | $0.415 | Plus 0.0002 BNB. **Fits the Agentic Wallet's 15,000,000 `--gasLimit` cap and the BSC 16,777,216 per-tx cap** |
| `enter`, BNB, opens the bracket, with excess refund | 326,780 | $0.0097 | New game storage plus first entry |
| `enter`, BNB, mid-bracket, with excess refund | 206,492 | $0.0061 | |
| `enter`, BNB, last entry → FULL | 213,650 | $0.0063 | |
| `enter`, USDC, opens the bracket | 239,515 | $0.0071 | `transferFrom` of the exact amount |
| `enter`, USDC, mid-bracket | 205,331 | $0.0061 | |
| `settle` ROOKIE (8 players, 28 matches × 20 rounds) | 824,235 | $0.024 | Includes 28 `MatchPlayed` events and 8 player records |
| `settle` PRO (4 players, 6 matches × 20 rounds) | 232,657 | $0.0069 | |
| `createChallenge`, BNB | 348,487 | $0.010 | |
| `acceptChallenge`, USDC (plays the match, tie split) | 388,708 | $0.011 | |
| `claim` (BNB + USDC) | 86,850 | $0.0026 | |

## Deployment (measured on a local anvil fork of BSC mainnet, full broadcast of `script/Deploy.s.sol`)

| | Amount |
|---|---|
| Total gas (forge estimate for all transactions) | 15,738,748 → 0.000787 BNB at 0.05 gwei |
| BNB actually spent by the deployer | **0.00118966 BNB** (gas + 3 × 0.0002 BNB starter tape-out fees) |
| BEM actually spent | **0.12 BEM** sent to the registry. The factory takes a 0.1 BEM deploy fee, and 50,000 NAND cost 50,000 × 1e-8 + 0.01 BEM. About 0.0095 BEM stays in the registry |

## Per-tier cost to a player (gas only, excluding the entry fee)

- **Rookie:** one `enter` (≈ $0.006–0.010), plus the winner's `claim` ($0.003). Anyone can pay the `settle` ($0.024).
- **Pro:** `enter` ≈ $0.006–0.010; `settle` $0.007.
- **Champion:** `createChallenge` $0.010 / `acceptChallenge` $0.011.
- **A circuit is submitted once and reused:** 2 gates ≈ $0.16 including the TapeOut fee; 88 gates ≈ $0.53.

At 1 gwei (20× today), Rookie settle would be $0.49 and an 88-gate submit $8.30, so the gate cap matters (PHASE0 §B10).
