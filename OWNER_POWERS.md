# GateWars — owner powers

Both contracts use OpenZeppelin `Ownable2Step`: an ownership transfer only takes effect once the new owner accepts it.

Neither contract is upgradeable. There is no proxy, no `delegatecall` and no `selfdestruct`. The contracts never mint tokens, never tax transfers, and cannot freeze user balances.

Every function on this page also appears in the contracts' NatSpec, and each one emits an event.

## Arena

| Function | What it can do | What it can never do |
|---|---|---|
| `setTierFeeUsd(tier, usd8)` | Sets a tier's entry fee in USD, 8 decimals (defaults: ROOKIE 1e8 = $1, PRO 5e8, CHAMPION 10e8). Must be > 0. Applies to **new** entries only; entrants already in a game keep their recorded `paid`, and refunds return exactly that. Event `TierFeeUsdSet`. | Change what an existing entrant paid or will be refunded. |
| `setMaxPriceAge(seconds)` | Sets the oldest Chainlink BNB/USD answer accepted for BNB entries. Bounded to **5 minutes … 2 hours** (default 1 hour). Event `MaxPriceAgeSet`. | Turn off the staleness check, or set it outside those bounds. |
| `pause()` / `unpause()` | Blocks **only** `enter`, `createChallenge` and `acceptChallenge`. | Block `settle`, `expire`, `claim` or `claimRefund`; tests prove all four work while paused. |
| `withdrawTreasury(asset, to, amount)` | Withdraws BNB or USDC from that asset's `treasury`, which is the 20% share. It is booked only when a game **settles**. Event `TreasuryWithdrawn`. | Touch prize pools, refundable entries (`locked`) or winnings (`claimableTotal`). `amount > treasury[asset]` reverts. Invariant, fuzz-tested: `balance(asset) >= locked + claimableTotal + treasury` |
| `transferOwnership` / `acceptOwnership` / `renounceOwnership` | Standard `Ownable2Step`. | — |

Fixed in the code, which the owner can't change:
- the 80/20 split (`POOL_BPS = 8000`);
- bracket sizes 8 and 4;
- 20 rounds;
- the 24h expiry;
- the unlock rules: 1 Rookie win for Pro, 3 Pro wins for Champion;
- the Chainlink feed, USDC token, Agent ID contract and registry addresses (all immutable).

## CircuitRegistry

| Function | What it can do | What it can never do |
|---|---|---|
| `createProcessor(supply, mintPrice)` | One-time: creates the GateWars TapeOut processor, paying the factory's BEM deploy fee from BEM this contract holds. The approval is exact and reset to 0 afterwards. | Run twice (`AlreadySet`). |
| `mintTransistors(amount)` | Buys NAND transistors with the registry's own BEM (`mintPrice × amount + protocolFee`). The approval is exact and reset to 0. | Spend anyone else's tokens. |
| `seedStarters()` | One-time: tapes out TIT_FOR_TAT, GRIM_TRIGGER and ALWAYS_DEFECT, owned by the registry and usable by anyone. | Run twice. |
| `setFeePerGate(wei)` | Sets the BNB charged per gate on top of the TapeOut fee, to cover transistor costs. Default 0. Event `FeePerGateSet`. `submitCircuit` requires `msg.value == tapeOutFee(gates)` exactly. | Change the TapeOut fee. That fee is read live from the processor and forwarded in full. |
| `pause()` / `unpause()` | Blocks `submitCircuit` only. | Change or delete any circuit or table. A submitted table is permanent. |
| `withdrawFees(to, amount)` | Withdraws the accumulated per-gate fees (`feesAccrued`). | Withdraw more than `feesAccrued`. The registry never holds player prize money. |
| `rescueToken(token, to, amount)` | Moves ERC-20s the registry holds, which is operational BEM for transistors. | — The registry never holds player ERC-20s. |
| `transferOwnership` / `acceptOwnership` / `renounceOwnership` | Standard `Ownable2Step`. | — |

## External trust assumptions (not owner powers, but worth knowing)

- **TapeOut** processors, the factory and the transistor contracts are upgradeable and **not sealed** (PHASE0.md §A1). A change there could alter future tape-outs or fees. Tables already cached in the registry, and everything in the Arena, are unaffected.
- The **Agent ID** contract owner can register handles (`adminRegister`). GateWars only checks `balanceOf > 0` and displays `handleOf`.
- **Chainlink BNB/USD** prices BNB entries. USDC entries don't use the oracle.
