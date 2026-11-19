"use client";
import { useMemo, useState } from "react";
import { useReadContract } from "wagmi";
import { compile, dslToTable, vsStarters, STARTERS as STARTER_TABLES, MAX_GATES, tableHex } from "@gatewars/compiler";
import { ADDR, registryAbi } from "@/lib/contracts";
import { fmtBnb, RiskBanner, useAgent, useTx } from "@/components/ui";

const PRESETS: Record<string, string> = {
  TIT_FOR_TAT: "cooperate if opp_last == C\ndefault defect",
  GRIM_TRIGGER: "cooperate if my_last == C and opp_last == C\ndefault defect",
  ALWAYS_DEFECT: "default defect",
  "Tit for two tats": "defect if opp_last == D and opp_last2 == D\ndefault cooperate",
  "Forgiving majority": "cooperate if opp_last == C\ndefect if opp_defects_in_last3 >= 2\ndefault cooperate",
};

function label(k: number) {
  const m = [k & 1, (k >> 1) & 1, (k >> 2) & 1].map((x) => (x ? "C" : "D")).join("");
  const o = [(k >> 3) & 1, (k >> 4) & 1, (k >> 5) & 1].map((x) => (x ? "C" : "D")).join("");
  return `me ${m} | opp ${o} (t-1,t-2,t-3)`;
}

export default function Builder() {
  const [mode, setMode] = useState<"dsl" | "table">("dsl");
  const [dsl, setDsl] = useState(PRESETS["Forgiving majority"]);
  const [table, setTable] = useState<bigint>(STARTER_TABLES.TIT_FOR_TAT);
  const { address, hasAgentId } = useAgent();
  const tx = useTx();

  const result = useMemo(() => {
    try {
      const t = mode === "dsl" ? dslToTable(dsl) : table;
      const c = compile(t);
      return { ok: true as const, c, vs: vsStarters(t) };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
  }, [mode, dsl, table]);

  const gates = result.ok ? result.c.gates : 0;
  const { data: fee } = useReadContract({ address: ADDR.registry, abi: registryAbi, functionName: "tapeOutFee", args: [BigInt(gates)], query: { enabled: result.ok } });

  const toggle = (k: number) => setTable((t) => t ^ (1n << BigInt(k)));
  const cur = mode === "dsl" && result.ok ? result.c.table : table;

  return (
    <>
      <h1>Builder</h1>
      <p className="muted">
        A strategy sees its own last 3 moves and the opponent&apos;s last 3 (before round 1 everything reads as cooperate) and outputs cooperate or defect.
        It compiles to a NAND circuit (≤ {MAX_GATES} gates) that the registry tapes out on TapeOut and caches as a 64-entry table.
      </p>
      <div className="row">
        <button className={mode === "dsl" ? "" : "secondary"} onClick={() => setMode("dsl")}>
          Rules
        </button>
        <button className={mode === "table" ? "" : "secondary"} onClick={() => { if (result.ok) setTable(result.c.table); setMode("table"); }}>
          Truth table
        </button>
        <select onChange={(e) => { setMode("dsl"); setDsl(PRESETS[e.target.value]); }} defaultValue="">
          <option value="" disabled>
            load preset…
          </option>
          {Object.keys(PRESETS).map((k) => (
            <option key={k}>{k}</option>
          ))}
        </select>
      </div>

      <div className="grid" style={{ marginTop: 14 }}>
        <div className="card">
          {mode === "dsl" ? (
            <>
              <h3>Rules (first match wins)</h3>
              <textarea value={dsl} onChange={(e) => setDsl(e.target.value)} spellCheck={false} />
              <p className="muted" style={{ fontSize: 12 }}>
                variables: my_last my_last2 my_last3 opp_last opp_last2 opp_last3 (C/D) · my_/opp_defects_in_last3, my_/opp_coops_in_last3 (also _in_last2) · operators == != &gt;= &lt;= &gt; &lt; and or not ( )
              </p>
            </>
          ) : (
            <>
              <h3>Truth table (64 histories)</h3>
              <div className="tt">
                {Array.from({ length: 64 }, (_, k) => (
                  <button key={k} title={label(k)} className={(table >> BigInt(k)) & 1n ? "on" : "off"} onClick={() => toggle(k)}>
                    {k}
                  </button>
                ))}
              </div>
              <p className="muted" style={{ fontSize: 12 }}>green = cooperate, red = defect. Hover a cell for its history. Cell k: bit0..2 my t-1..t-3, bit3..5 opponent t-1..t-3.</p>
            </>
          )}
        </div>
        <div className="card">
          <h3>Compiled</h3>
          {!result.ok ? (
            <p className="err">{result.error}</p>
          ) : (
            <>
              <p>
                table <span className="code">{tableHex(cur)}</span>
              </p>
              <p>
                <b className={result.c.fitsRegistry ? "ok" : "err"}>{result.c.gates} gates</b> <span className="muted">({result.c.method})</span>
              </p>
              <div className="code" style={{ maxHeight: 90, overflow: "auto" }}>
                {result.c.netlist}
              </div>
              <h2>Simulated vs starters (20 rounds)</h2>
              <table>
                <tbody>
                  {result.vs.map((r) => (
                    <tr key={r.opponent}>
                      <td>{r.opponent}</td>
                      <td>
                        you <b>{r.you}</b> – {r.them}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h3>Submit</h3>
        <RiskBanner />
        {!address ? (
          <p className="muted">Connect a wallet to submit. Agentic Wallet users: `gatewars submit &quot;&lt;rules&gt;&quot;` in the skill.</p>
        ) : hasAgentId === false ? (
          <p className="err">This wallet has no SPACE ID Agent ID.</p>
        ) : (
          <div className="row">
            <span>exact fee: {fee !== undefined ? fmtBnb(fee, 6) : "…"} (TapeOut tape-out fee)</span>
            <button
              disabled={!result.ok || !result.c.fitsRegistry || fee === undefined || tx.busy}
              onClick={() => result.ok && tx.send({ address: ADDR.registry, abi: registryAbi, functionName: "submitCircuit", args: [result.c.netlist], value: fee! }).catch(() => {})}
            >
              Submit circuit
            </button>
          </div>
        )}
        {tx.status}
        {tx.receipt?.status === "success" && <p className="ok">Submitted — your circuit appears in the entry form under &quot;mine&quot;.</p>}
      </div>
    </>
  );
}
