"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { bscscan, displayName, STARTER_NAMES, STATES, TIERS } from "@/lib/contracts";
import { roundRobin, useGame, useTables } from "@/lib/data";
import { useL } from "@/lib/i18n";
import DuelScope, { MoveLog } from "@/components/DuelScope";
import { ChipSeat, PoolValue } from "@/components/Chips";
import EntrySheet from "@/components/EntrySheet";
import { AgentCommand, fmtBnb, fmtUsdc, RiskBanner, Skel, StateLabel, TIER_PART, TIER_ZH, useLeft, useNow } from "@/components/ui";

export default function MatchPage({ params }: { params: { id: string } }) {
  const L = useL();
  const left = useLeft();
  const id = BigInt(params.id);
  const { data: g, isLoading } = useGame(id);
  const { data: tables } = useTables(g?.circuits);
  const now = useNow(1000);
  const [sel, setSel] = useState(0);
  const [sheet, setSheet] = useState(false);
  useEffect(() => {
    const m = /m=(\d+)/.exec(window.location.hash);
    if (m) setSel(Number(m[1]));
  }, []);
  const rr = useMemo(() => {
    if (!g || !tables) return null;
    const ts = g.circuits.map((c) => tables[String(c)]);
    return ts.some((t) => t === undefined) ? null : roundRobin(ts);
  }, [g, tables]);

  if (isLoading || !g)
    return (
      <div style={{ minHeight: "150vh", paddingTop: 32 }} aria-busy="true">
        <Skel w={240} />
        <div className="grid-2" style={{ marginTop: 20 }}>
          <div className="panel" style={{ height: 420 }} />
          <div className="panel" style={{ height: 420 }} />
        </div>
      </div>
    );
  if (g.openedAt === 0) return <p style={{ marginTop: 40 }}>{L(`第 ${params.id} 桌不存在。`, `Table #${params.id} does not exist.`)}</p>;
  const state = STATES[g.state];
  const name = (i: number) => displayName(g.handles[i], g.players[i]);
  const played = state === "SETTLED" || state === "FULL";
  const expiredNow = state === "OPEN" && now >= Number(g.expiresAt);
  const order = g.players.map((_, i) => i).sort((a, b) => (rr ? rr.totals[b] - rr.totals[a] : 0) || a - b);
  const m = rr?.matches[sel];
  const share = typeof window !== "undefined" ? `${window.location.origin}/m/${params.id}/${sel}` : "";
  const tierName = L(`${TIER_ZH[g.tier]}赛`, TIERS[g.tier]);

  return (
    <>
      <section style={{ padding: "32px 0 0" }}>
        <div className="row between">
          <div>
            <span className="label">
              {L(`第 ${params.id} 桌`, `TABLE #${params.id}`)} · {TIER_PART[g.tier]} · {g.tier === 2 ? L("冠军挑战", "CHAMPION CHALLENGE") : L("循环赛", "ROUND ROBIN")}
            </span>
            <h1 style={{ marginTop: 8, fontSize: "clamp(30px, 5vw, 48px)" }}>
              {tierName} #{params.id}
            </h1>
          </div>
          <div className="col gap-4" style={{ alignItems: "flex-end" }}>
            <StateLabel state={g.state} />
            <span className="mono" style={{ fontSize: 13 }}>
              {state === "OPEN" ? `${L("截止", "CLOSES IN")} ${left(Number(g.expiresAt), now)}` : state === "FULL" ? L("可结算", "READY TO SETTLE") : ""}
            </span>
          </div>
        </div>
      </section>

      <div className="grid-2" style={{ marginTop: 20, alignItems: "start" }}>
        <div className="panel pad col gap-16">
          <ChipSeat tier={g.tier} game={g} onTake={state === "OPEN" && !expiredNow ? () => setSheet(true) : undefined} />
          <PoolValue g={g} />
          {state === "OPEN" && !expiredNow && g.tier !== 2 && (
            <button className="btn lg" style={{ alignSelf: "flex-start" }} onClick={() => setSheet(true)}>
              {L("入座", "TAKE A SEAT")}
            </button>
          )}
          {state === "FULL" && g.tier !== 2 && (
            <AgentCommand cmd={`gatewars settle ${params.id}`} note={L("已满员：任何人都可结算（守护程序也会自动结算）。", "Full: anyone may settle (the keeper also settles automatically).")} />
          )}
          {(state === "EXPIRED" || expiredNow) && (
            <AgentCommand
              cmd={`gatewars refund ${params.id}`}
              note={L("超过 24 小时未满员：每位参赛者可全额退回所付资产。", "Unfilled after 24h: every entrant can get exactly what they paid back.")}
            />
          )}
          {state === "OPEN" && <RiskBanner />}
        </div>

        <div className="panel">
          {!played ? (
            <div className="pad col gap-8">
              <span className="label">{L("排名", "STANDINGS")}</span>
              <div className="mono" style={{ fontSize: 22, fontWeight: 700 }}>
                {L("等待中", "WAITING")} {g.players.length}/{g.size}
              </div>
              <p className="ink3" style={{ margin: 0, fontSize: 14 }}>
                {L("最后一个席位坐满后即开赛。目前已入座：", "Matches run when the last seat fills. Seated so far:")}
              </p>
              <div className="col">
                {g.players.map((p, i) => (
                  <div key={p} className="row between mono" style={{ fontSize: 13, padding: "10px 0", borderBottom: "1px solid var(--line-3)" }}>
                    <Link href={`/me?a=${p}`} style={{ color: "var(--ink)", fontWeight: 600 }}>
                      {name(i)}
                    </Link>
                    <span className="muted">
                      #{String(g.circuits[i])} {STARTER_NAMES[Number(g.circuits[i])] ?? ""}
                    </span>
                  </div>
                ))}
                {Array.from({ length: g.size - g.players.length }, (_, k) => (
                  <div key={k} className="mono muted" style={{ fontSize: 13, padding: "10px 0", borderBottom: "1px solid var(--line-3)" }}>
                    {L("空位", "open seat")}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="tbl-wrap" style={{ border: 0 }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>{L("名次", "RANK")}</th>
                    <th>{L("智能体", "AGENT")}</th>
                    <th>{L("电路", "CIRCUIT")}</th>
                    <th>{L("得分", "SCORE")}</th>
                    <th>{L("已付", "PAID")}</th>
                  </tr>
                </thead>
                <tbody>
                  {order.map((i, r) => (
                    <tr key={g.players[i]} className={g.players[i] === g.winner ? "sel" : ""}>
                      <td>{String(r + 1).padStart(2, "0")}</td>
                      <td style={{ fontWeight: 600 }}>
                        <Link href={`/me?a=${g.players[i]}`} style={{ color: "var(--ink)" }}>
                          {name(i)}
                        </Link>{" "}
                        {g.players[i] === g.winner && <span className="c-coop">· {L("冠军", "WINNER")}</span>}
                      </td>
                      <td>
                        #{String(g.circuits[i])} <span className="muted">{STARTER_NAMES[Number(g.circuits[i])] ?? ""}</span>
                      </td>
                      <td style={{ fontWeight: 700 }}>{rr ? rr.totals[i] : "…"}</td>
                      <td className="muted">{g.assets[i] === 0 ? fmtBnb(g.paid[i], 5) : fmtUsdc(g.paid[i])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="label sm" style={{ padding: "8px 14px" }}>
                {L("同分判定：总分 → 相互对战得分 → 先报名者", "TIE-BREAK: TOTAL → HEAD-TO-HEAD → EARLIEST ENTRY")}
              </p>
            </div>
          )}
        </div>
      </div>

      {played && rr && m && (
        <section className="section">
          <div className="section-head">
            <div>
              <span className="label">
                {L("回放 · 第", "REPLAY · MATCH")} {String(sel + 1).padStart(2, "0")}/{rr.matches.length}
              </span>
              <h2>
                {name(m.a)} vs {name(m.b)}
              </h2>
            </div>
          </div>
          <DuelScope nameA={name(m.a)} nameB={name(m.b)} movesA={m.movesA} movesB={m.movesB} mode="replay" shareUrl={share} key={sel} />
          <div style={{ marginTop: 12 }}>
            <MoveLog movesA={m.movesA} movesB={m.movesB} />
          </div>
          <div className="tbl-wrap" style={{ marginTop: 16 }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>#</th>
                  <th>CH_A</th>
                  <th>{L("比分", "SCORE")}</th>
                  <th>CH_B</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rr.matches.map((x, k) => (
                  <tr key={k} className={k === sel ? "sel" : ""}>
                    <td>{String(k + 1).padStart(2, "0")}</td>
                    <td style={{ fontWeight: x.scoreA > x.scoreB ? 700 : 400 }}>{name(x.a)}</td>
                    <td>
                      {x.scoreA} – {x.scoreB}
                    </td>
                    <td style={{ fontWeight: x.scoreB > x.scoreA ? 700 : 400 }}>{name(x.b)}</td>
                    <td style={{ textAlign: "right" }}>
                      <button className="btn outline" style={{ minHeight: 36 }} aria-pressed={k === sel} onClick={() => setSel(k)}>
                        {L("回放", "REPLAY")}
                      </button>{" "}
                      <Link href={`/m/${params.id}/${k}`} className="btn ghost" style={{ minHeight: 36 }}>
                        {L("链接", "LINK")}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <p className="mono muted" style={{ fontSize: 12, marginTop: 24 }}>
        <a href={bscscan(g.players[0] ?? "")} target="_blank" rel="noreferrer" hidden={!g.players.length}>
          BSCSCAN ↗
        </a>
      </p>
      <EntrySheet open={sheet} onClose={() => setSheet(false)} tier={g.tier} mode={g.tier === 2 ? "accept" : "enter"} challengeId={g.tier === 2 ? id : undefined} />
    </>
  );
}
