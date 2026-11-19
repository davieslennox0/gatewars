"use client";
import { useMemo, useState } from "react";
import { useRead } from "@/lib/client";
import { useL } from "@/lib/i18n";
import { compile, dslToTable, play, STARTERS as T, MAX_GATES, tableHex } from "@gatewars/compiler";
import { ADDR, registryAbi } from "@/lib/contracts";
import DuelScope from "@/components/DuelScope";
import { ledIndex, TRIPLES } from "@/components/Chips";
import { AgentCommand, fmtBnb, RiskBanner, Skel } from "@/components/ui";

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
  const L = useL();

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
  const { data: fee } = useRead<bigint>({ address: ADDR.registry, abi: registryAbi, functionName: "tapeOutFee", args: [BigInt(gates)], enabled: res.ok });
  const sims = useMemo(() => (Object.entries(T) as [string, bigint][]).map(([n, t]) => ({ n, ...play(cur, t) })), [cur]);

  return (
    <>
      <section style={{ padding: "40px 0 8px" }}>
        <span className="label">{L(`电路设计 · 6 输入 · 1 输出 · ≤ ${MAX_GATES} 个与非门`, `BUILDER · 6 INPUTS · 1 OUTPUT · ≤ ${MAX_GATES} NAND`)}</span>
        <h1 style={{ marginTop: 10 }}>{L("设计你的芯片。", "Design the chip.")}</h1>
        <p className="ink3" style={{ maxWidth: 760, fontSize: 16 }}>
          {L(
            "每颗灯代表一种历史：列 = 你最近 3 步，行 = 对手最近 3 步（最新在前）。亮蓝 = 合作。第 1 回合视为 CCC/CCC。编译器把它最小化为与非门；注册合约在 TapeOut 上流片并缓存全部 64 个答案。",
            "Each LED is one history: your last 3 moves (columns) and the opponent's last 3 (rows), newest first. Blue = cooperate. Round 1 reads as CCC/CCC. The compiler minimises it to NAND gates; the registry tapes it out on TapeOut and caches all 64 answers.",
          )}
        </p>
      </section>

      <div className="row" style={{ margin: "12px 0 16px" }}>
        <div className="seg" role="group" aria-label={L("编辑器", "Editor")}>
          <button aria-pressed={mode === "leds"} onClick={() => { if (res.ok) setTable(res.c.table); setMode("leds"); }}>
            {L("灯阵真值表", "LED TABLE")}
          </button>
          <button aria-pressed={mode === "rules"} onClick={() => setMode("rules")}>
            {L("规则", "RULES")}
          </button>
        </div>
        <label className="row gap-8">
          <span className="label">{L("预设", "PRESET")}</span>
          <select
            defaultValue=""
            onChange={(e) => {
              const src = PRESETS[e.target.value];
              setDsl(src);
              setTable(dslToTable(src));
            }}
          >
            <option value="" disabled>
              {L("载入…", "LOAD…")}
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
                <span className="label">{L("真值表 · 8×8", "TRUTH TABLE · 8×8")}</span>
                <span className="label">{L("行 = 对手最近3步 · 列 = 我最近3步", "ROWS = OPP LAST 3 · COLS = ME LAST 3")}</span>
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
                <span className="label">{L("规则 · 首条匹配生效", "RULES · FIRST MATCH WINS")}</span>
              </div>
              <textarea aria-label={L("策略规则", "Strategy rules")} value={dsl} onChange={(e) => setDsl(e.target.value)} spellCheck={false} />
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
                    {L("门数", "GATES")} {res.c.gates}/{MAX_GATES}
                  </span>
                  <span className="label">{res.c.fitsRegistry ? L("可上链", "FITS") : L("过大", "TOO BIG")}</span>
                </div>
                <div className="meter" role="meter" aria-valuemin={0} aria-valuemax={MAX_GATES} aria-valuenow={res.c.gates} aria-label={L("门数", "gate count")}>
                  <i style={{ width: `${Math.min(100, (res.c.gates / MAX_GATES) * 100)}%` }} />
                </div>
                <div className="row between mono" style={{ fontSize: 12 }}>
                  <span>{L("合作格", "COOPERATE CELLS")} {popcount(cur)}/64</span>
                  <span className="muted">{L("表", "TABLE")} {tableHex(cur)}</span>
                </div>
                <div className="code" style={{ maxHeight: 64, overflow: "auto" }}>
                  {res.c.netlist}
                </div>
              </>
            )}
          </div>
          <span className="label">{L("实时模拟 · 20 回合 · 对阵入门电路", "LIVE SIM · 20 ROUNDS VS STARTERS")}</span>
          {sims.map((s) => (
            <DuelScope key={s.n} nameA={L("你的芯片", "YOUR CHIP")} nameB={s.n} movesA={s.movesA} movesB={s.movesB} mode="static" compact title={`${L("你", "YOU")} ${s.scoreA} – ${s.scoreB} ${s.n}`} />
          ))}
        </div>
      </div>

      <section className="section panel pad col gap-16">
        <div className="row between">
          <div>
            <span className="label">{L("流片", "TAPE-OUT")}</span>
            <h2>{L("提交到注册合约", "Submit to the registry")}</h2>
          </div>
          <span className="mono">
            {L("精确费用", "EXACT FEE")} {fee !== undefined ? fmtBnb(fee, 4) : <Skel />}
          </span>
        </div>
        <RiskBanner />
        {res.ok && res.c.fitsRegistry ? (
          <AgentCommand
            cmd={`gatewars submit ${tableHex(cur)}`}
            note={L(
              "智能体用你的 Agent ID 钱包提交该真值表（编译结果与此处一致），先预览、经你确认后才发送。",
              "Your agent submits this table from your Agent ID wallet (it compiles to the same netlist), previewing first and sending only after you confirm.",
            )}
          />
        ) : (
          <p className="c-defect">{L("电路超过 88 个门，无法提交。", "Over 88 gates, cannot be submitted.")}</p>
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
