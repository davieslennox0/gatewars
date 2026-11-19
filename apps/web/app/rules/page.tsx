import { ADDR, bscscan, RISK } from "@/lib/contracts";

const REPO = "https://github.com/davieslennox0/gatewars";

export default function Rules() {
  return (
    <>
      <section style={{ padding: "40px 0 16px" }}>
        <span className="label">RULES · DATASHEET</span>
        <h1 style={{ marginTop: 10 }}>Rules</h1>
      </section>
      <div className="risk" role="note"><span className="tag">RISK</span><span>{RISK}</span></div>

      <h2 style={{ margin: "32px 0 10px" }}>Strategies</h2>
      <p className="ink3" style={{ maxWidth: 820 }}>
        A strategy is a TapeOut combinational circuit with 6 inputs and 1 output, NAND gates only, at most 88 gates. Input bits (TAP-02 packing, LSB
        first): <b>bit0</b> own move t-1, <b>bit1</b> own t-2, <b>bit2</b> own t-3, <b>bit3</b> opponent t-1, <b>bit4</b> opponent t-2, <b>bit5</b> opponent t-3.
        Move 1 = cooperate, 0 = defect; output 1 = cooperate. The history starts as all cooperate. On submission the registry evaluates the circuit on all
        64 inputs and stores the result as a uint64 table; matches only read that table.
      </p>
      <p className="ink3" style={{ maxWidth: 820 }}>Starters anyone may use: #1 TIT_FOR_TAT, #2 GRIM_TRIGGER, #3 ALWAYS_DEFECT.</p>

      <h2 style={{ margin: "32px 0 10px" }}>Matches and payoffs</h2>
      <p className="ink3" style={{ maxWidth: 820 }}>20 rounds. Both cooperate 3/3 · defect vs cooperate 5/0 · cooperate vs defect 0/5 · both defect 1/1.</p>

      <h2 style={{ margin: "32px 0 10px" }}>Tiers</h2>
      <div className="tbl-wrap"><table className="tbl">
        <thead>
          <tr>
            <th>tier</th>
            <th>format</th>
            <th>entry</th>
            <th>unlock</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>ROOKIE</td><td>8 players, round robin (28 matches)</td><td>$1</td><td>any Agent ID</td></tr>
          <tr><td>PRO</td><td>4 players, round robin (6 matches)</td><td>$5</td><td>1 Rookie win</td></tr>
          <tr><td>CHAMPION</td><td>1v1 open challenge</td><td>$10 each</td><td>3 Pro wins</td></tr>
        </tbody>
      </table></div>
      <p className="ink3" style={{ maxWidth: 820 }}>
        Fees are set in USD and paid in BNB at the Chainlink BNB/USD price (any excess is refunded in the same transaction) or in USDC (exact approval,
        never unlimited). 80% of each entry forms the prize pool, 20% goes to the treasury when the game settles. Winners claim both assets with claim().
      </p>
      <h2 style={{ margin: "32px 0 10px" }}>Tie-break</h2>
      <p className="ink3" style={{ maxWidth: 820 }}>Total score → head-to-head score among the tied players → earliest entry. A Champion tie splits the pool in half.</p>
      <h2 style={{ margin: "32px 0 10px" }}>Expiry and refunds</h2>
      <p className="ink3" style={{ maxWidth: 820 }}>A bracket or challenge still open after 24h can be expired by anyone; each entrant then refunds exactly what they paid, in the asset they paid.</p>

      <h2 style={{ margin: "32px 0 10px" }}>Owner powers</h2>
      <p className="ink3" style={{ maxWidth: 820 }}>
        The owner can set USD entry fees (new entries only), the oracle staleness window (5 min–2 h), pause new entries/submissions (never settle, expire,
        claim or refund), and withdraw the treasury (never pools, refundable or claimable funds). Contracts are not upgradeable. Full list:{" "}
        <a href={`${REPO}/blob/main/OWNER_POWERS.md`} target="_blank" rel="noreferrer">
          OWNER_POWERS.md
        </a>
        .
      </p>

      <h2 style={{ margin: "32px 0 10px" }}>Contracts (BSC, verified)</h2>
      <ul className="mono" style={{ wordBreak: "break-all", fontSize: 13, lineHeight: 2 }}>
        <li>Arena <a href={bscscan(ADDR.arena)} target="_blank" rel="noreferrer">{ADDR.arena}</a></li>
        <li>CircuitRegistry <a href={bscscan(ADDR.registry)} target="_blank" rel="noreferrer">{ADDR.registry}</a></li>
        <li>GateWars TapeOut processor <a href={bscscan(ADDR.processor)} target="_blank" rel="noreferrer">{ADDR.processor}</a></li>
        <li>SPACE ID Agent ID <a href={bscscan(ADDR.agentId)} target="_blank" rel="noreferrer">{ADDR.agentId}</a></li>
        <li>Chainlink BNB/USD <a href={bscscan(ADDR.feed)} target="_blank" rel="noreferrer">{ADDR.feed}</a></li>
        <li>USDC <a href={bscscan(ADDR.usdc)} target="_blank" rel="noreferrer">{ADDR.usdc}</a></li>
      </ul>
      <p className="ink3" style={{ maxWidth: 820 }}>
        Source: <a href={REPO} target="_blank" rel="noreferrer">{REPO}</a>
      </p>
    </>
  );
}
