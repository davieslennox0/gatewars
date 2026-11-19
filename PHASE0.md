# GateWars — Phase 0: Research + Benchmarks

Date: 2026-11-19 (UTC). Chain: BNB Smart Chain (56).
Reproduce: `cd phase0 && forge install` (or clone forge-std into `lib/`), then
`FORK_RPC=https://bsc-mainnet.public.blastapi.io forge test -vv`. Raw run: `phase0/results/forge-test.txt`
(fork block ~134,473,388, forge 1.9.0, 11/11 tests pass). Netlists: `python3 phase0/netlists/gen.py`.

Conventions:
- **[measured]** = a fork test or `eth_call` we ran, with its file named.
- **[source]** = verified contract source or an official doc/TAP, cited.
- **[derived]** = arithmetic on measured numbers.
- **UNKNOWN** = not confirmed, with how to find out.

Price snapshot used for every USD figure:
- `eth_gasPrice` = **0.05 gwei** [measured, `results/forge-test.txt` header].
- **BNB = $589.06** [measured, PancakeSwap V3 QuoterV2 1 WBNB→USDT at block 134,471,499, `results/bem-quotes.txt`].
- So **1,000,000 gas = $0.02945**.

Gas figures are execution gas measured with `gasleft()` around the external call inside the fork test. A real transaction adds 21,000 intrinsic gas plus calldata, about $0.0006. The processor account was already warm from `setUp`, so a first call in a fresh transaction costs up to about 2.6k more per cold account.

---

## A. TapeOut on BSC

### A1. Contracts, and TapeOut vs Behemoth

| Role | Address | Evidence |
|---|---|---|
| Processor factory (UUPS proxy) | `0x68224F668083c29e9800Be2a646d42d18cedF7e2` | TAP-02 §Deployments; TAP-10 §appendix |
| Factory implementation, **current** | `0x51535d8e41fe8e9b26134ed6deeee71a66b33fc4` | [measured] ERC-1967 slot, `results/onchain-reads.txt`. **TAP-02 lists `0xa68cCF49…6422`**, so the factory has been upgraded since 2026-09-29 |
| Factory status | not sealed (`isSealed()=false`); owner `0xB3D85b42A045c1A88D800CAD0F55d2566a4D3138`; `bem()` = BEM | [measured] same file |
| Circuit beacon / implementation (code behind every processor) | `0xf8D6d8EB894d6971c8976Ad8b4971cbEFE028156` / `0x8E1D125Def6d3826C278299273a0760D47626068` | TAP-02; [measured] `implementation()` unchanged |
| Transistor beacon / implementation (ERC-1155; id 0 = NAND, 1 = LATCH) | `0xa528e147d7e065249fc52864502c9b245C6c9f66` / `0x32e1fa125B6Abe0FF12eeC43E2daB482019a1E97` | [measured] `factory.transistorBeacon()`, `implementation()`, function selectors |
| **TapeOut** processor (mining-eligible, P=1) | `0xb1024b89886B9a34Aa4ff5F31C411D708b20a14C` (on-chain name "TapeOut", 18,343 circuits); transistors `0xCC42ba5De07f01B472a5b14cF45aBcCA79Eb8087` | [measured] `PodMining.processorMultiplier` = 1 |
| **Behemoth** processor (mining-eligible, P=6) | `0x1F5Cb4aeaE1807Bf60c3b9C0D8aDBCC14e91f12C` (on-chain name **"Blonskr_No1"**, symbol BLN1, 2,781 circuits); transistors `0xE2DfD802081C7a05341E20b6582b04b908e8550c` | [measured] multiplier = 6. [source] the official tapeout.net bundle `/app/assets/index-DizVcbig.js` maps `{"0x1f5cb4…f12c":"Behemoth"}` and says "only Behemoth / TapeOut can mine" |
| BEM token (`PodToken`) | `0x5ce033B2bFCa3Af30b3e8C8457DeaF776A8b695a`, 8 decimals, 21M cap, no owner, no tax | [source] Sourcify full match, `src/PodToken.sol` |
| BEM minter = PodMining (UUPS proxy) | `0x7E2E0DC66a3bD9103E69b766afA62d9f7b697b46`, impl `0xa3dbe873da37cd4e4a13c7cef23a7db6ca60f898` (Sourcify-verified, `src/PodMining.sol` + `PodNetlist` library `0xfbb661fe281112c601954abb0a3cdcc697a6e6ba`) | [measured] `BEM.minter()`; ERC-1967 slot |

**The difference** [measured, `results/processors-all.tsv` over all 1,495 factory processors]:
- Of the 1,495 processors, exactly **two** have a nonzero mining multiplier:
  - TapeOut (P=1);
  - Behemoth (on-chain name `Blonskr_No1`, P=6).
- Both run the **same circuit implementation**, `0x8E1D…6068`. Netlist format, `eval` and the tape-out fee of 0.0002 BNB are identical.
- They differ in three ways:
  - **Mining weight:** Behemoth carries a 6× multiplier in PodMining.
  - **Transistor supply:** TapeOut has a 1,000,000 cap; Behemoth has 100,000.
  - **Creation:** both were made by `0x571d447f4f24688eC35Ccf07f1D6993655F6aF15`, the creator field of both transistor contracts.
- **Both transistor supplies are sold out** (minted equals cap). New transistors for these two exist only on the secondary market.
- **Look-alikes:** about 40 other processors are named "TapeOut…" or "Behemoth…", for example `0x494E93aE…e971` "Behemoth 官方". All of them have P=0. `results/processors-named.tsv` lists them, and the UI must not trust names.

### A2. Netlist format (TAP-02) and deployment

[source] TAP-02 §2–§6, https://github.com/TapeOutProtocol/TAPs/blob/main/TAPs/TAP-02.md

**Signals.** Signals are numbered in this order:
- 0 is constant 0, and 1 is constant 1;
- 2 … 2+nIn−1 are the inputs;
- after those come element outputs, in record order.

All integers are big-endian, and `u24` holds a signal index.

**Records.** There is no header and no padding.

| Opcode | Record | Bytes | Produces |
|---|---|---|---|
| `0x00` NAND | `a:u24 b:u24` | 7 | `NOT(a AND b)` |
| `0x01` LATCH | `d:u24` | 4 | the state bit from the previous beat. `d` may point forward (feedback) |
| `0x02` REF | `cpu:20, id:u64, nIns:u8, nOuts:u8, ins:u24×nIns` | 31+3·nIns | the outputs of circuit (cpu, id) |

**Well-formedness rules:**
- NAND and REF inputs must point backwards only.
- The outputs are the **last nOut produced signals**, never inputs or constants. Even an identity circuit therefore needs 2 NANDs.
- REF targets must be on a factory-registered processor.

**Bit packing.** Bit i is bit `i mod 8` of byte `i/8`, least-significant bit first. Short input strings are read leniently.

**Deployment.** Tape-out is `tapeout(bytes netlist, uint32 nIn, uint32 nOut) payable returns (uint256 id)` (selector `0x7bd3ac1d`). It performs these steps:
1. requires `msg.value == TAPEOUT_FEE`, which is 0.0002 BNB [measured, both eligible processors];
2. checks the well-formedness rules;
3. burns the caller's top-level NAND and LATCH count in transistors;
4. stores the netlist as SSTORE2 chunks;
5. mints a circuit ERC-721 to the caller.

**Addressing.** A circuit is the pair (processor address, id). Ids start at 1 within each processor.

**New processors are paid in BEM now** [measured, `test/Phase0.t.sol` `setUp`]:
- `createCPU(name, symbol, story, transistorSupply, mintPrice)` takes its deploy fee in BEM by `transferFrom`: 0.1 BEM (`deployFee` = 10,000,000 units of 1e-8). The signature comes from the official bundle ABI string.
- On such a processor, `mint(id, amount)` costs `mintPrice × amount` plus a **0.01 BEM protocol fee per mint call**, all in BEM. We set `mintPrice` to 1 unit, and 2,000 NAND cost 1,002,000 units.
- The 0.0002 BNB tape-out fee stays in BNB.
- The older eligible processors price transistors at `mintPrice` = 5e14, which is 0.0005 BNB.

| Measured tape-out (execution gas) | Gas | USD |
|---|---|---|
| ALLD (1 gate, 7 B) | 256,197 | $0.0075 |
| TFT / GRIM (2 gates, 14 B) | 224,761 / 224,765 | $0.0066 |
| LUT_RANDOM (86 gates, 602 B) | 463,722 | $0.0137 |
| ARGMAX8x10 (1,408 gates, 9,856 B) | 4,255,418 | $0.125 |
| TFT taped out **by our contract** | 265,636 | $0.0078 |

**Architecture fact** [measured, `test_A2_tapeoutViaContract`]: a contract can call `tapeout` itself. It burns the **contract's** transistors, it receives the circuit NFT, and the user's transistors are untouched. A user's only transaction can therefore be a call to *our* registry, which matches the hackathon rule.

### A3. Third-party evaluation

- `eval(uint256 id, bytes inputs) view returns (bytes)` (selector `0x934d06ea`) works for combinational circuits.
- `step(uint256 id, bytes state, bytes inputs) view returns (bytes newState, bytes outputs)` (`0xe8281a1a`) is the version with caller-supplied state.

Sources: TAP-02 §6, plus the selectors in circuit implementation `0x8E1D…6068`.

[measured, `test_A3_thirdPartyEvalIsViewAndFree`]:
- Any contract and any caller can evaluate any circuit, with arbitrary inputs, in a view call.
- **Evaluation consumes no transistors.** The NAND balance is unchanged, and the only cost is gas.
- The cost is about **33.5k gas fixed plus about 2.26k gas per gate** (B5).

### A4. Reference strategy netlists

The input layout is defined in `phase0/netlists/gen.py` and `src/DuelEngine.sol`:
- input 0, 1, 2 = my move at t-1, t-2, t-3;
- input 3, 4, 5 = the opponent's move at t-1, t-2, t-3;
- 1 means cooperate;
- history before round 1 is padded with "cooperate";
- cache bit k is the output for packed input byte k.

| Strategy | Netlist (hex) | Gates | Cached table | Logic |
|---|---|---|---|---|
| Always-defect | `00000001000001` | **1** | `0x0000000000000000` | `NAND(1,1)=0` |
| Tit-for-tat | `00000005000005 00000008000008` | **2** | `0xff00ff00ff00ff00` | double-invert input 3 |
| Grim trigger | `00000002000005 00000008000008` | **2** | `0xaa00aa00aa00aa00` | `in0 AND in3`. Exact grim: once I defect, in0 = 0 and I defect forever |
| (benchmark) random 6-in function | `out/netlists.json` | 86 | `0x7b21ef2ecb49a2b1` | Shannon mux tree, constant-folded |

All four truth tables were checked bit for bit with the TAP-02 reference implementation, `phase0/netlists/tap02_reference.py`, copied from `TAPs/assets/tap-02`. They were checked again **on chain**: the cache built via `eval` equals the reference table [measured, `test_B6_cacheBuild`].

**Worst case [derived].** The mux-tree compiler needs at most 6 + 48 + 24 + 12 + 6 + 3 + 2 = **101 gates** for any 6-input function: level 1 folds to free signals and each later mux costs 3 NANDs. A random function took 86.

---

## B. Gas benchmarks (BSC mainnet fork)

### B5. One evaluation [measured, `test_B5_*`]

| Circuit | Gates | Gas | USD |
|---|---|---|---|
| ALLD | 1 | 33,499 | $0.00099 |
| TFT | 2 | 35,740 | $0.00105 |
| GRIM | 2 | 35,741 | $0.00105 |
| LUT_RANDOM | 86 | 224,801 | $0.0066 |
| mainnet `0x54840f62…77cC0` #1 (top-level only, 16 in) | 1,204 | 2,751,132 | $0.081 |
| ARGMAX8x10 | 1,408 | 3,228,795 | $0.095 |

### B6. Full 64-entry cache, and the 2,317 gas/gate claim [measured, `test_B6_*`]

| Circuit | 64 evals + 1 SSTORE | USD | One tx? |
|---|---|---|---|
| ALLD | 924,802 | $0.027 | yes |
| TFT | 1,097,342 | $0.032 | yes |
| GRIM | 1,092,734 | $0.032 | yes |
| LUT_RANDOM (86 gates) | 13,197,694 | $0.389 | yes, but near the limit. Split in two: 6,630,061 + 6,614,379 |

**2,317 gas/gate: confirmed, with one caveat.**
- On a 1,204-gate circuit we measured **2,285 gas/gate on average** (2,751,132 / 1,204). That is within 1.4% of TAP-02's 2,789,919 / 1,204 = 2,317.
- The marginal cost is about **2,259 gas/gate**: (2,751,132 − 33,499) / 1,203. The 86-gate circuit gives 2,251, and ARGMAX gives 2,293 on average.
- **The caveat:** for strategy-sized circuits, the **fixed ~33.5k per eval** dominates, not the per-gate rate. A 2-gate cache costs 1.1M gas, of which 64 × 33.5k = 2.1M would be the naive estimate.

**Split threshold [derived].** The model is cache gas ≈ 64 × (33.5k + 2.26k × gates).
- The Agentic Wallet caps `--gasLimit` at 15,000,000 [source, `references/external-sign.md`], and the BSC transaction cap is 16,777,216 (TAP-02).
- One transaction therefore fits up to about **89 gates**.
- The 101-gate worst case needs about 16.8M gas, so it must be split. Two transactions of 32 evals each fit any 6-input circuit.

### B7. One match from cached tables [measured, `test_B7_match`]

| Rounds | Gas (external call) | USD |
|---|---|---|
| 10 | 10,526 | $0.00031 |
| 20 | 15,314 | $0.00045 |

The engine's results match hand-computed scores:
- TFT vs ALLD over 10 rounds: 9 / 14.
- TFT vs GRIM: 30 / 30.
- GRIM vs ALLD over 20 rounds: 19 / 24.

### B8. Bracket settlement in one transaction [measured, `test_B8_settleRookieAndPro`]

| Bracket | 10 rounds | 20 rounds | USD at 20 rounds |
|---|---|---|---|
| Rookie: 8 players, 28 matches, argmax, 1 SSTORE | 208,434 | 330,488 | $0.0097 |
| Pro: 4 players, 6 matches | 69,592 | 98,335 | $0.0029 |

**Both settle in one transaction with a lot of headroom.** No splitting is needed: Rookie at 20 rounds uses 2% of the cap.

### B9. Winner selection [measured, `test_B9_*`]

| Method | Gas | USD |
|---|---|---|
| (a) Solidity argmax over 8 scores, with tie-break | 9,111 | $0.00027 |
| (b) TapeOut comparator circuit: 8 × 10-bit scores, 1,408 gates, verified on 300 vectors including forced ties | 3,238,475 | $0.095 |

Solidity is about **355× cheaper**. The circuit is also a second piece of code to trust, behind an upgradeable beacon (see the risks section).

**Tie-break proposal**, implemented in `ArenaBench.argmax` (the two-way case):
1. Highest total score.
2. If exactly two players are tied, the head-to-head winner of their match.
3. Otherwise, or if their head-to-head match was drawn, the **earliest entry**, meaning the lowest entry index.

For three or more tied players, Phase 1 should use head-to-head wins among the tied group, then earliest entry. That costs a few thousand extra gas.

### B10. USD and recommendations

**Round count: recommend 20.**
- Going from 10 to 20 rounds adds $0.0036 per Rookie settle.
- Twenty rounds is 6× the 3-move memory, so strategies reach their steady-state behaviour.
- Strategies can't see the round number: their inputs are history only, so a fixed round count can't be gamed with end-game defection.

**The $1 tier is viable.**
- Gas per Rookie bracket is about $0.01 to settle, plus the entry and claim transactions. Their gas is UNKNOWN until Phase 1 measures them; storage writes suggest about 60–120k each, but that is an estimate, not a measurement.
- The real cost of entering is **tape-out plus cache, about $0.16** for a small circuit (see the cost table), paid once per circuit, not per bracket.
- **Gas price risk:** at 1 gwei instead of 0.05 (20×), Rookie settlement is still $0.19, but a 90-gate cache becomes about $7.80. Cap the circuit size (see the GO/CHANGE section).

---

## C. BEM

### C11. Proof-of-Design mining

All of this is [source] PodMining at `0xa3dbe873…f898`, verified on Sourcify, and its NatSpec matches the code.

**Interface:**
- `commitDesign(circuits, commitment)` is optional anti-front-running. It must be sent at least one block before tape-out.
- `arm(circuits, id)` must be its own transaction before `start` with a task.
- `start(address circuits, uint256 circuitId, uint32 taskId, uint256 anchorBlock, bytes[] inputs, bytes[] expectedOuts, bytes32[][] proofs, bytes32 salt)` starts mining.
- `claim(bytes32 key)` / `claimMany`. Anyone can trigger a claim, but **BEM is always minted to the circuit NFT's current owner**.
- `stop(key)` stops mining.

**Eligibility:**
1. `processorMultiplier[circuits] > 0`. Only TapeOut and Behemoth qualify [measured].
2. Every REF in the netlist must also be on an eligible processor. The frontend copy says that circuits with REF cannot mine.
3. `msg.sender == ownerOf(circuitId)`.
4. The circuit must have more than 0 gates.

**Can an arbitrary circuit mine? Yes, but almost for nothing.**
- `taskId = 0` drops the circuit into the "unverified" pool, which gets f = **1%** of emission.
- Its share there is proportional to b* × P, where b* = NANDs burned + 6 × LATCHes burned.
- The other 99% goes only to circuits that pass one of the 267 frozen official tasks (`tasksFrozen()=true`, `taskCount()=267` [measured]). Those tasks are the catalogue on tapeout.market/create, and our strategies match none of them.
- `PodMining.owner()` is `0x0` [measured], so it has been renounced, and no new task, such as a prisoner's-dilemma task, can ever be added.

**Yield for a strategy circuit [derived from measured `totalUnverWeight` = 41,297].**
- Emission is 7,200 BEM/day, so the unverified pool gets 72 BEM/day.
- A 10-gate circuit on TapeOut (P=1) earns 72 × 10 / 41,307 ≈ **0.017 BEM/day, about $0.18/day**, and it accrues **to the NFT holder over time**, not per match.
- Eligibility needs transistors from the two sold-out processors, which means buying on the secondary market. **Secondary-market price: UNKNOWN.** To find out, read the tapeout.market order book contract. tapeout.market returned HTTP 429 to our fetches.

**Can a contract mine for a pool and pay a winner?**
- Mechanically yes: a contract that owns an eligible circuit NFT can call `start`, and `claim` mints to it, so it could forward the BEM.
- But it is a slow stream, not a lump sum: about $0.18/day per 10 gates, against prize pools of $6.40–$16.
- It also needs eligible transistors that are now sold out. **Not usable as a prize mechanism.**

### C12. Swap fallback [measured, `results/bem-quotes.txt`, block 134,471,499]

Pools (GeckoTerminal, same session):
- PCS v3 BEM/USDT 1%: $144k liquidity;
- PCS v3 BEM/USDT 0.01%: $56k;
- PCS v3 BEM/WBNB 1%: $70k.

Combined 24h volume across these three is about $600k. The price is about **$10.50/BEM**.

| Buy | Best route (QuoterV2) | BEM out | Effective $/BEM | Price impact |
|---|---|---|---|---|
| $6.40 | WBNB -0.01%→ USDT -0.01%→ BEM | 0.608699 | $10.514 | 0.023% |
| $16 | WBNB -0.01%→ USDT -0.01%→ BEM | 1.521186 | $10.518 | 0.061% |
| $64 | WBNB -0.01%→ USDT -1%→ BEM | 6.081460 | $10.524 | 0.049% |

The direct WBNB/BEM 1% route costs about 0.9% more because of its pool fee. Swap gas is about 190–210k ($0.006).

### C13. Verdict

- **Prize in BNB by default: GO.**
- **BEM-by-mining: NO.** It's a time stream rather than a lump sum, needs sold-out transistors, and the task list is frozen.
- **BEM-by-swap: feasible as an opt-in at claim time** (`claim(bemOut=true, minOut)`). Slippage is under 0.25% at our sizes.
  - It adds a router dependency and needs a caller-supplied `minOut`, to stop sandwich attacks.
  - Recommendation: ship BNB only for the deadline, and add BEM-at-claim only if time allows.

---

## D. Agent ID

### D14. balanceOf and ABI

[source] `HandleRegistry` at `0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F`, Sourcify full match; ABI saved at `phase0/results/abi/AgentID_HandleRegistry.json`. [measured] `test_D14_agentId`.

- `name()` is "SPACE ID Agent ID" and `symbol()` is "AI". It's an ERC-721 with `tokenId = uint256(keccak256(handle))`.
- `balanceOf(address) > 0` works:
  - our owner wallet returns 1;
  - a random address returns 0.
- **Non-transferable:** `_update` reverts `Soulbound()` for any existing token, and `approve` / `setApprovalForAll` always revert. We confirmed that a transfer reverts with `Soulbound()`.
- **There is no burn path**, so an Agent ID is permanent.
- One handle per address (`AddressHasHandle`).
- **Centralization note:** the owner (`0x457C1fd14750c6c30886A2f2B57F1eF44B095882`, Ownable2Step) can `adminRegister` handles and change the signer.

Minimal ABI:
- `balanceOf(address) view returns (uint256)`
- `handleOf(address) view returns (string)`
- `ownerOfHandle(string) view returns (address)`
- `ownerOf(uint256) view returns (address)`

### D15. Showing name.ai for an address

- **On chain: yes.** `handleOf(address)` returns the bare handle; `handleOf(0xaca7…60CD)` returned `"syke"` [measured]. Display it as `syke.ai`.
- **No API call is needed.** `tokenURI` is `baseURI + handle + suffix`.
- **Conflict to raise:** the spec says Champion is "1v1 challenge by name.ai", and the contract has `ownerOfHandle(string)`, but that is a name→wallet lookup, which the hackathon rule forbids.
  - Proposal: the challenger picks an opponent **address**, for example from their past opponents shown in the UI, and the UI displays the name via `handleOf`.
  - **UNKNOWN** whether organizers count `ownerOfHandle` as "search". Ask them in writing before building Champion.

---

## E. Agentic Wallet skill

### E16. Contract calls, limits and BSC

Sources:
- the binance-skills-hub skill `binance-agentic-wallet` at commit `4fc14e4c` (2026-11-12): `SKILL.md`, `references/external-sign.md`, `references/wallet-setting.md`;
- the docs at web3.binance.com/en/dev-docs/products/agentic-wallet: introduction, security, use-cases/developer-mode.

**Building a call.** A third-party skill builds the calldata itself and drives the `baw` CLI:

```
baw wallet settings --json                     # require devMode.enabled=true first
baw contract-call preview --binanceChainId 56 --from <agentWallet> --to <Arena> \
    --value <wei> --inputData 0x<abi-encoded enter(tier)> --json
# show parsedTx, simulationResult.balanceChanges, risks, authorityChanges -> user confirms
baw contract-call execute --requestId <id from preview> --json
```

- `--value` is wei and must be an integer.
- `--gasLimit` is optional: from 21,000 to 15,000,000, and a cap, not an override.
- **Developer Mode is required.** It can only be switched on in the Binance App. It lasts 7 days, and each use extends it. It has its own daily limit, separate from the main `dailyLimit`. Enabling is refused when the wallet balance is above the Developer Mode cap (error 351804).
- Results are `BROADCASTED`, or `PENDING_CONFIRMATION`, which needs approval in the App.
- High-risk calls are blocked or pushed to the App, depending on the `abnormalTxnHandling` setting.

**Measured on our own wallet.** Earlier today this agent ran a value-0 `contract-call` on BSC: tx `0x04540958a017f4576e26afe7efc108b8a75c9f3c762966478e27b421bc0c400b`.
- It returned `BROADCASTED` with `requireConfirmation: false`.
- Afterwards, `developerModeQuotaUsed` was still 0 and `devMode.expiresAt` had moved to 2026-11-26. So value-0 calls don't use up the quota, and use extends the expiry.
- A **payable** call (value > 0) is documented but **not yet measured by us.** To find out, run one $1 `enter` preview on the fork deployment in Phase 1.

**BSC is supported.** Both `baw wallet chains` and the docs list BNB Smart Chain, chain ID 56.

**"Secure Auto Sign": UNKNOWN.**
- The term doesn't appear in the skill repo, in the three docs pages, or in `baw` 1.12.0 `--help`, and no settings key matches it.
- The docs only say that per-transaction confirmation is skill behaviour (you can tell the agent to stop asking) and that the daily pools reset at 00:00 UTC.
- To find out, ask the hackathon or Binance contact for the doc link, or check the Agentic Wallet settings page in the Binance App.

### E17. Minimal skill outline

1. **Generate strategy.** The model writes a 64-bit truth table, or a rule from a template (TFT, grim, majority and so on), for the 6-input layout in A4.
2. **Compile.** A truth table becomes a netlist through `gen.py`-style Shannon expansion with folding, at most 101 gates. The skill checks the netlist locally with the TAP-02 reference simulator before spending anything.
3. **Submit.** `CircuitRegistry.submitNetlist(netlist)` sends `value` = the tape-out fee.
   - Our registry tapes out on the GateWars processor using **its own** pre-bought transistors, which A2 shows works. It then builds the 64-entry cache and binds the circuit to `msg.sender`, which must hold an Agent ID.
   - This is one user transaction, to our contract. For more than about 89 gates it becomes two, using `finishCache`.
4. **Enter.** `Arena.enter{value: entryWei}(tier, circuitKey)` is called with `baw contract-call preview` and then `execute`.
5. **Claim.** `Arena.claim(bracketId)` or `claimRefund(bracketId)`. The display name comes from `handleOf`.

---

## Cost table (USD at 0.05 gwei, BNB $589.06)

| Item | Breakdown | USD |
|---|---|---|
| **Per circuit submission**, 2-gate strategy | 0.0002 BNB tape-out fee ($0.118) + tape-out via registry 265,636 gas ($0.008) + cache 1,097,342 gas ($0.032) + transistors (GateWars processor, `mintPrice` 1 unit: about $0) | **≈ $0.16** |
| Per circuit submission, 86-gate strategy | $0.118 + 463,722 gas ($0.014) + 13,197,694 gas ($0.389) | **≈ $0.52** |
| One-time: GateWars processor | 0.1 BEM deploy fee ($1.05) + 0.01 BEM per transistor mint call ($0.105), bulk-minted by the registry | ≈ $1.2 once |
| Per bracket settle, Rookie (8p, 28m, 20 rounds) | 330,488 gas | **$0.0097** |
| Per bracket settle, Pro (4p, 6m, 20 rounds) | 98,335 gas | **$0.0029** |
| Per bracket settle, Champion (1 match, 20 rounds) | about 15,314 gas plus the write (match measured) | ≈ $0.0005 |
| **Rookie tier** | entry $1 × 8 = $8 → prize $6.40, treasury $1.60. Gas: settle $0.01, enter and claim UNKNOWN (measure in Phase 1) | gas < 1% of the pool |
| **Pro tier** | $5 × 4 = $20 → prize $16, treasury $4 | gas < 0.1% |
| **Champion tier** | $10 × 2 = $20 → prize $16, treasury $4 | gas < 0.01% |

---

## GO / CHANGE

| Decision | Verdict | Why (evidence) |
|---|---|---|
| Cache design (64 `eval`s → `uint64`) | **GO, with a gate cap of 89 for a one-transaction submit, or a 2-transaction `submitRange` split for up to 101 gates** | 1.1M gas / $0.03 for real strategies (B6). The cache also **snapshots** behaviour, which protects matches from beacon upgrades (Risk 2) |
| Round count | **CHANGE → 20 fixed** | +$0.0036 per Rookie settle against 10 rounds (B8); 6× the memory window |
| $1 tier | **GO** | settle costs $0.0097 (B8). Entry and claim gas still to be measured |
| Comparator circuit vs Solidity argmax | **Solidity** | 9,111 vs 3,238,475 gas (B9) |
| Prize asset | **BNB.** BEM-by-swap is an optional stretch goal; BEM-by-mining is NO | C11–C13 |
| Transaction splitting | **Settle: no split** (Rookie uses 2% of the cap). **Submit: split only for circuits over 89 gates** | B6, B8 |
| Where circuits live | **CHANGE: create a GateWars processor**, with the registry tapeing out and owning circuits | The eligible processors' transistors are sold out (A1). The registry tape-out path works (A2) and keeps every user action on our contracts |

## Proposed contracts (Phase 1)

```solidity
// CircuitRegistry — tapes out on the GateWars processor, caches the 64-entry table, binds to an Agent ID.
interface ICircuitRegistry {
    event CircuitSubmitted(uint256 indexed key, address indexed agent, address cpu, uint256 circuitId, uint64 table, uint32 gates);
    function submitNetlist(bytes calldata netlist) external payable returns (uint256 key);      // value = TAPEOUT_FEE; nIn=6,nOut=1 enforced
    function submitNetlistPartial(bytes calldata netlist) external payable returns (uint256 key); // for >89 gates: tape out + first 32 evals
    function finishCache(uint256 key) external;                                                // remaining 32 evals
    function tableOf(uint256 key) external view returns (uint64 table, bool ready);
    function agentOf(uint256 key) external view returns (address);
    function circuitsOf(address agent) external view returns (uint256[] memory keys);
    function topUpTransistors(uint256 amount) external;                                        // owner/anyone: bulk mint (BEM)
    // constants: CPU (GateWars processor), AGENT_ID = 0x60B9…022F, MAX_GATES = 101
}

// DuelEngine — pure library (measured version in phase0/src/DuelEngine.sol)
library DuelEngine {
    function play(uint64 a, uint64 b, uint256 rounds) internal pure returns (uint256 sa, uint256 sb);
    function roundRobin(uint64[] memory t, uint256 rounds) internal pure returns (uint256[] memory scores, uint256 h2h);
    function pickWinner(uint256[] memory scores, uint256 h2h) internal pure returns (uint256 idx); // score > h2h > earliest
}

// Arena — brackets, entry in BNB, 80/20 split held in-contract, claims and refunds.
interface IArena {
    enum Tier { Rookie, Pro, Champion }
    event Entered(uint256 indexed bracketId, address indexed agent, uint256 circuitKey, uint256 slot);
    event Settled(uint256 indexed bracketId, address winner, uint256 prize);
    function enter(Tier tier, uint256 circuitKey) external payable returns (uint256 bracketId);   // requires Agent ID, unlock rules
    function challenge(address opponent, uint256 circuitKey) external payable returns (uint256 bracketId); // Champion (see D15)
    function accept(uint256 bracketId, uint256 circuitKey) external payable;
    function settle(uint256 bracketId) external;            // anyone, once full; one tx (measured)
    function claim(uint256 bracketId) external;             // winner, pull payment
    function claimRefund(uint256 bracketId) external;       // unfilled after 24h: full entry incl. the 20%
    function entryWei(Tier tier) external view returns (uint256);
    function wins(address agent, Tier tier) external view returns (uint256);
    function treasuryBalance() external view returns (uint256);
    function withdrawTreasury(address to, uint256 amount) external; // onlyOwner; only the accrued 20% of settled brackets
}
```

Entry pricing: fixed wei per tier, owner-settable with an event, is the simplest choice. A Chainlink BNB/USD feed works on BSC, but whether one is wanted is UNKNOWN until the team decides; if it is, read it in `enter` and don't trust a stale `updatedAt`.

## Top 5 risks to the deadline (2026-12-09 08:00 UTC, 20 days out)

1. **TapeOut is upgradeable and not sealed.**
   - The factory isn't sealed, and its implementation **changed after TAP-02** (now `0x5153…3fc4`). The fee currency also moved to BEM.
   - Processors and transistors are beacon proxies, so `tapeout`, `eval` or the fees can change mid-hackathon.
   - Mitigation: the cache snapshot protects matches. Keep tape-out isolated in one registry function, read fees at call time, and run the fork tests again before submitting.
2. **Name→wallet rule vs Champion "challenge by name.ai."** This could force a redesign late. Get the organizers' ruling now (D15).
3. **Agentic Wallet constraints for real users.**
   - Users need Developer Mode, which is App-only, lasts 7 days, and is refused above a balance cap.
   - Payable `contract-call` has not been measured yet.
   - "Secure Auto Sign" is undocumented.
   - Mitigation: prove one end-to-end payable `enter` from an Agentic Wallet in the first Phase 1 week.
4. **Registry transistor inventory needs BEM.** Minting needs BEM and costs 0.01 BEM per call. If the registry runs out, every submission reverts. Bulk-mint ahead of time, top up with a monitor alert, and treat price or fee changes as a beacon-upgrade risk.
5. **Gas and size edge cases.**
   - Circuits near 101 gates need the two-transaction path.
   - A gas spike up to 1 gwei makes big caches cost dollars.
   - Free archive RPCs are flaky: bsc-dataseed prunes state after about 128 blocks, and only blastapi and thirdweb served history in our test.
   - Mitigation: a gate cap and a paid RPC for CI and deploy scripts.
