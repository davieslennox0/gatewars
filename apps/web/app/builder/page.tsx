"use client";
import { useMemo, useState } from "react";
import { useReadContract } from "wagmi";
import { compile, dslToTable, vsStarters, STARTERS as STARTER_TABLES, MAX_GATES, tableHex } from "@gatewars/compiler";
import { ADDR, registryAbi } from "@/lib/contracts";
import { fmtBnb, RiskBanner, useAgent, useTx } from "@/components/ui";

const PRESETS: Record<string, string> = {
  "Forgiving majority": "cooperate if opp_last == C\ndefect if opp_defects_in_last3 >= 2\ndefault cooperate",
  "Sentinel-3": "defect if opp_defects_in_last3 >= 1\ndefault cooperate",
  "Tit for two tats": "defect if opp_last == D and opp_last2 == D\ndefault cooperate",
  TIT_FOR_TAT: "cooperate if opp_last == C\ndefault defect",
  GRIM_TRIGGER: "cooperate if my_last == C and opp_last == C\ndefault defect",
  ALWAYS_DEFECT: "default defect",
};

function label(k: number) {
  const m = [k & 1, (k >> 1) & 1, (k >> 2) & 1].map((x) => (x ? "C" : "D")).join("");
  const o = [(k >> 3) & 1, (k >> 4) & 1, (k >> 5) & 1].map((x) => (x ? "C" : "D")).join("");
  return `me ${m} · opp ${o}  (t-1, t-2, t-3)`;
}

export default function Builder() {
  const [mode, setMode] = useState<"dsl" | "table">("dsl");
  const [dsl, setDsl] = useState(PRESETS["Forgiving majority"]);
  const [table, setTable] = useState<bigint>(STARTER_TABLES.TIT_FOR_TAT);
  const [hover, setHover] = useState<number | null>(null);
  const { address, hasAgentId } = useAgent();
  const tx = useTx();

  const result = useMemo(() => {
    try {
      const t = mode === "dsl" ? dslToTable(dsl) : table;
      return { ok: true as const, c: compile(t), vs: vsStarters(t) };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
  }, [mode, dsl, table]);
  const gates = result.ok ? result.c.gates : 0;
  const { data: fee } = useReadContract({ address: ADDR.registry, abi: registryAbi, functionName: "tapeOutFee", args: [BigInt(gates)], query: { enabled: result.ok } });
  const cur = result.ok ? result.c.table : table;

  return (
    <>
      <section style={{ padding: "40px 0 8px" }}>
        <div className="eyebrow">strategy builder</div>
        <h1 style={{ marginTop: 10 }}>
          Design. <span className="grad">Compile.</span> Tape out.
        </h1>
        <p className="muted" style={{ maxWidth: 680, fontSize: 16 }}>
          Your circuit sees its own last 3 moves and the opponent&apos;s last 3 (round 1 sees all-cooperate) and outputs cooperate or defect. The
          compiler minimises it to ≤ {MAX_GATES} NAND gates; the registry tapes it out on TapeOut and caches all 64 answers.
        </p>
      </section>

      <div className="row" style={{ margin: "14px 0" }}>
        <div className="seg">
          <button className={mode === "dsl" ? "on" : ""} onClick={() => setMode("dsl")}>
            Rules
          </button>
          <button
            className={mode === "table" ? "on" : ""}
            onClick={() => {
              if (result.ok) setTable(result.c.table);
              setMode("table");
            }}
          >
            Truth table
          </button>
        </div>
        <select
          defaultValue=""
          onChange={(e) => {
            setMode("dsl");
            setDsl(PRESETS[e.target.value]);
          }}
        >
          <option value="" disabled>
            load a preset…
          </option>
          {Object.keys(PRESETS).map((k) => (
            <option key={k}>{k}</option>
          ))}
        </select>
      </div>

      <div className="grid-2">
        <div className="card">
          {mode === "dsl" ? (
            <>
              <div className="row between">
                <h3>Rules</h3>
                <span className="eyebrow">first match wins</span>
              </div>
              <textarea style={{ marginTop: 12 }} value={dsl} onChange={(e) => setDsl(e.target.value)} spellCheck={false} />
              <div className="code" style={{ marginTop: 12, lineHeight: 1.7 }}>
                <span className="ok">moves</span> my_last my_last2 my_last3 opp_last opp_last2 opp_last3 = C|D
                <br />
                <span className="ok">counts</span> opp_defects_in_last3 opp_coops_in_last3 my_defects_in_last3 … (_in_last2)
                <br />
                <span className="ok">ops</span> == != &gt;= &lt;= &gt; &lt; and or not ( ) · default cooperate|defect
              </div>
            </>
          ) : (
            <>
              <div className="row between">
                <h3>Truth table</h3>
                <span className="eyebrow mono">{hover !== null ? label(hover) : "hover a cell"}</span>
              </div>
              <div className="board" style={{ marginTop: 12 }}>
                {Array.from({ length: 64 }, (_, k) => (
                  <button
                    key={k}
                    className={(table >> BigInt(k)) & 1n ? "on" : "off"}
                    onMouseEnter={() => setHover(k)}
                    onMouseLeave={() => setHover(null)}
                    onClick={() => setTable((t) => t ^ (1n << BigInt(k)))}
                  >
                    {(table >> BigInt(k)) & 1n ? "C" : "D"}
                  </button>
                ))}
              </div>
              <p className="muted" style={{ fontSize: 12 }}>
                Cell k: bits 0–2 your moves t-1..t-3, bits 3–5 the opponent&apos;s. Click to flip.
              </p>
            </>
          )}
        </div>

        <div className="card glow" style={{ "--accent": "var(--volt)" } as React.CSSProperties}>
          <div className="row between">
            <h3>Compiled circuit</h3>
            {result.ok && <span className={`pill ${result.c.fitsRegistry ? "open" : "expired"}`}>{result.c.fitsRegistry ? "FITS" : "TOO BIG"}</span>}
          </div>
          {!result.ok ? (
            <p className="err" style={{ marginTop: 12 }}>
              {result.error}
            </p>
          ) : (
            <>
              <div className="row between" style={{ margin: "16px 0 6px" }}>
                <span className="mono" style={{ fontSize: 28, fontWeight: 700 }}>
                  {result.c.gates}
                  <span className="muted" style={{ fontSize: 14 }}> / {MAX_GATES} gates</span>
                </span>
                <span className="mono dim" style={{ fontSize: 12 }}>
                  {result.c.method}
                </span>
              </div>
              <div className="gauge">
                <i style={{ width: `${Math.min(100, (result.c.gates / MAX_GATES) * 100)}%` }} />
              </div>
              <div className="row between" style={{ margin: "14px 0 6px" }}>
                <span className="eyebrow">table</span>
                <span className="mono">{tableHex(cur)}</span>
              </div>
              <div className="code" style={{ maxHeight: 70, overflow: "auto" }}>
                {result.c.netlist}
              </div>
              <div className="eyebrow" style={{ margin: "18px 0 8px" }}>
                simulated vs starters · 20 rounds
              </div>
              <div className="stack">
                {result.vs.map((r) => {
                  const tot = r.you + r.them || 1;
                  return (
                    <div key={r.opponent}>
                      <div className="row between mono" style={{ fontSize: 12 }}>
                        <span>
                          you <b className={r.you >= r.them ? "ok" : "err"}>{r.you}</b>
                        </span>
                        <span className="muted">{r.opponent}</span>
                        <span>{r.them}</span>
                      </div>
                      <div className="meter" style={{ display: "flex" }}>
                        <i style={{ width: `${(r.you / tot) * 100}%` }} />
                        <i style={{ width: `${(r.them / tot) * 100}%`, background: "var(--defect)" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="row between">
          <h3>Tape it out</h3>
          <span className="mono">exact fee {fee !== undefined ? fmtBnb(fee, 4) : "…"}</span>
        </div>
        <RiskBanner />
        {!address ? (
          <p className="muted">Connect a wallet to submit. Agentic Wallet users: run `gatewars submit &quot;&lt;rules&gt;&quot;` through the skill.</p>
        ) : hasAgentId === false ? (
          <p className="err">This wallet has no SPACE ID Agent ID — every GateWars action requires one.</p>
        ) : (
          <button
            disabled={!result.ok || !result.c.fitsRegistry || fee === undefined || tx.busy}
            onClick={() => result.ok && tx.send({ address: ADDR.registry, abi: registryAbi, functionName: "submitCircuit", args: [result.c.netlist], value: fee! }).catch(() => {})}
          >
            Submit circuit
          </button>
        )}
        {tx.status}
        {tx.receipt?.status === "success" && <p className="ok">Taped out. It now appears under “mine” when you take a seat.</p>}
      </div>
    </>
  );
}
