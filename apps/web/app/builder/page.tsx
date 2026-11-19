"use client";
import { useMemo, useState } from "react";
import { useReadContract } from "wagmi";
import { compile, dslToTable, play, STARTERS as T, MAX_GATES, tableHex } from "@gatewars/compiler";
import { ADDR, registryAbi } from "@/lib/contracts";
import DuelScope from "@/components/DuelScope";
import { ledIndex, TRIPLES } from "@/components/Chips";
import { fmtBnb, RiskBanner, Skel, useAgent, useTx } from "@/components/ui";

const PRESETS: Record<string, string> = {
  "FORGIVING MAJORITY": "cooperate if opp_last == C\ndefect if opp_defects_in_last3 >= 2\ndefault cooperate",
  "SENTINEL-3": "defect if opp_defects_in_last3 >= 1\ndefault cooperate",
  "TIT FOR TWO TATS": "defect if opp_last == D and opp_last2 == D\ndefault cooperate",
  TIT_FOR_TAT: "cooperate if opp_last == C\ndefault defect",
  GRIM_TRIGGER: "cooperate if my_last == C and opp_last == C\ndefault defect",
  ALWAYS_DEFECT: "default defect",
};

function popcount(t: bigint) {
  let n = 0;
  for (let k = 0n; k < 64n; k++) if ((t >> k) & 1n) n++;
  return n;
}

export default function Builder() {
  const [mode, setMode] = useState<"leds" | "rules">("leds");
  const [dsl, setDsl] = useState(PRESETS["FORGIVING MAJORITY"]);
  const [table, setTable] = useState<bigint>(() => dslToTable(PRESETS["FORGIVING MAJORITY"]));
  const { address, hasAgentId } = useAgent();
  const tx = useTx();

  const res = useMemo(() => {
    try {
      const t = mode === "rules" ? dslToTable(dsl) : table;
      return { ok: true as const, c: compile(t) };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
  }, [mode, dsl, table]);
  const cur = res.ok ? res.c.table : table;
  const gates = res.ok ? res.c.gates : 0;
  const { data: fee } = useReadContract({ address: ADDR.registry, abi: registryAbi, functionName: "tapeOutFee", args: [BigInt(gates)], query: { enabled: res.ok } });
  const sims = useMemo(() => (Object.entries(T) as [string, bigint][]).map(([n, t]) => ({ n, ...play(cur, t) })), [cur]);

  return (
    <>
      <section style={{ padding: "40px 0 8px" }}>
        <span className="label">BUILDER · 6 INPUTS · 1 OUTPUT · ≤ {MAX_GATES} NAND</span>
        <h1 style={{ marginTop: 10 }}>Design the chip.</h1>
        <p className="ink3" style={{ maxWidth: 760, fontSize: 16 }}>
          Each LED is one history: your last 3 moves (columns) and the opponent&apos;s last 3 (rows), newest first. Lit = cooperate. Round 1 reads as CCC/CCC.
          The compiler minimises it to NAND gates; the registry tapes it out on TapeOut and caches all 64 answers.
        </p>
      </section>

      <div className="row" style={{ margin: "12px 0 16px" }}>
        <div className="seg" role="group" aria-label="Editor">
          <button aria-pressed={mode === "leds"} onClick={() => { if (res.ok) setTable(res.c.table); setMode("leds"); }}>
            LED TABLE
          </button>
          <button aria-pressed={mode === "rules"} onClick={() => setMode("rules")}>
            RULES
          </button>
        </div>
        <label className="row gap-8">
          <span className="label">PRESET</span>
          <select
            defaultValue=""
            onChange={(e) => {
              const src = PRESETS[e.target.value];
              setDsl(src);
              setTable(dslToTable(src));
            }}
          >
            <option value="" disabled>
              LOAD…
            </option>
            {Object.keys(PRESETS).map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid-2" style={{ alignItems: "start" }}>
        <div className="panel pad">
          {mode === "leds" ? (
            <>
              <div className="row between" style={{ marginBottom: 12 }}>
                <span className="label">TRUTH TABLE · 8×8</span>
                <span className="label">ROWS = OPP LAST 3 · COLS = ME LAST 3</span>
              </div>
              <div className="ledgrid">
                <span />
                {TRIPLES.map((c) => (
                  <span key={c} className="lbl">
                    {c}
                  </span>
                ))}
                {TRIPLES.map((rowLbl, row) => (
                  <Row key={rowLbl} row={row} rowLbl={rowLbl} table={table} onToggle={(k) => setTable((t) => t ^ (1n << BigInt(k)))} />
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="row between" style={{ marginBottom: 12 }}>
                <span className="label">RULES · FIRST MATCH WINS</span>
              </div>
              <textarea aria-label="Strategy rules" value={dsl} onChange={(e) => setDsl(e.target.value)} spellCheck={false} />
              <div className="code" style={{ marginTop: 12, lineHeight: 1.7 }}>
                MOVES my_last my_last2 my_last3 opp_last opp_last2 opp_last3 = C|D
                <br />
                COUNTS opp_defects_in_last3 opp_coops_in_last3 my_defects_in_last3 … (_in_last2)
                <br />
                OPS == != &gt;= &lt;= &gt; &lt; and or not ( ) · default cooperate|defect
              </div>
            </>
          )}
        </div>

        <div className="col gap-16">
          <div className="panel pad col gap-8">
            {!res.ok ? (
              <p className="c-defect" role="alert">
                {res.error}
              </p>
            ) : (
              <>
                <div className="row between">
                  <span className="mono" style={{ fontSize: 22, fontWeight: 700 }}>
                    GATES {res.c.gates}/{MAX_GATES}
                  </span>
                  <span className="label">{res.c.fitsRegistry ? "FITS" : "TOO BIG"}</span>
                </div>
                <div className="meter" role="meter" aria-valuemin={0} aria-valuemax={MAX_GATES} aria-valuenow={res.c.gates} aria-label="gate count">
                  <i style={{ width: `${Math.min(100, (res.c.gates / MAX_GATES) * 100)}%` }} />
                </div>
                <div className="row between mono" style={{ fontSize: 12 }}>
                  <span>COOPERATE CELLS {popcount(cur)}/64</span>
                  <span className="muted">TABLE {tableHex(cur)}</span>
                </div>
                <div className="code" style={{ maxHeight: 64, overflow: "auto" }}>
                  {res.c.netlist}
                </div>
              </>
            )}
          </div>
          <span className="label">LIVE SIM · 20 ROUNDS VS STARTERS</span>
          {sims.map((s) => (
            <DuelScope key={s.n} nameA="YOUR CHIP" nameB={s.n} movesA={s.movesA} movesB={s.movesB} mode="static" compact title={`YOU ${s.scoreA} – ${s.scoreB} ${s.n}`} />
          ))}
        </div>
      </div>

      <section className="section panel pad col gap-16">
        <div className="row between">
          <div>
            <span className="label">TAPE-OUT</span>
            <h2>Submit to the registry</h2>
          </div>
          <span className="mono">EXACT FEE {fee !== undefined ? fmtBnb(fee, 4) : <Skel />}</span>
        </div>
        <RiskBanner />
        {!address ? (
          <p className="ink3">Connect a wallet to tape out. Agentic Wallet users: `gatewars submit &quot;&lt;rules&gt;&quot;` through the skill.</p>
        ) : hasAgentId === false ? (
          <p className="c-defect">This wallet has no SPACE ID Agent ID — every GateWars action requires one.</p>
        ) : (
          <div>
            <button
              className="btn lg"
              disabled={!res.ok || !res.c.fitsRegistry || fee === undefined || tx.busy}
              onClick={() => res.ok && tx.send({ address: ADDR.registry, abi: registryAbi, functionName: "submitCircuit", args: [res.c.netlist], value: fee! }).catch(() => {})}
            >
              TAPE OUT · {fee !== undefined ? fmtBnb(fee, 4) : ""}
            </button>
            {tx.status}
          </div>
        )}
      </section>
    </>
  );
}

function Row({ row, rowLbl, table, onToggle }: { row: number; rowLbl: string; table: bigint; onToggle: (k: number) => void }) {
  return (
    <>
      <span className="lbl row">{rowLbl}</span>
      {TRIPLES.map((colLbl, col) => {
        const k = ledIndex(col, row);
        const on = ((table >> BigInt(k)) & 1n) === 1n;
        return (
          <button
            key={k}
            className={`ledbtn ${on ? "on" : ""}`}
            aria-label={`Me ${colLbl}, opponent ${rowLbl}: ${on ? "cooperate" : "defect"}`}
            aria-pressed={on}
            onClick={() => onToggle(k)}
          />
        );
      })}
    </>
  );
}
