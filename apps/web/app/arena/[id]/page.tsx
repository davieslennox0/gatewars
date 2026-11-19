"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ADDR, arenaAbi, ASSETS, bscscan, displayName, STARTER_NAMES, STATES, TIERS } from "@/lib/contracts";
import { roundRobin, useGame, useTables } from "@/lib/data";
import DuelScope, { MoveLog } from "@/components/DuelScope";
import { ChipSeat, PoolValue } from "@/components/Chips";
import EntrySheet from "@/components/EntrySheet";
import { fmtBnb, fmtLeft, fmtUsdc, RiskBanner, Skel, StateLabel, TIER_PART, useAgent, useNow, useTx } from "@/components/ui";

export default function MatchPage({ params }: { params: { id: string } }) {
  const id = BigInt(params.id);
  const { data: g, refetch, isLoading } = useGame(id);
  const { data: tables } = useTables(g?.circuits);
  const { address } = useAgent();
  const tx = useTx();
  const now = useNow(1000);
  const [sel, setSel] = useState(0);
  const [sheet, setSheet] = useState(false);
  useEffect(() => {
    if (tx.receipt) refetch();
  }, [tx.receipt, refetch]);
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
      <div style={{ marginTop: 40 }}>
        <Skel w={240} />
      </div>
    );
  if (g.openedAt === 0) return <p style={{ marginTop: 40 }}>Table #{params.id} does not exist.</p>;
  const state = STATES[g.state];
  const name = (i: number) => displayName(g.handles[i], g.players[i]);
  const mine = address ? g.players.findIndex((p) => p.toLowerCase() === address.toLowerCase()) : -1;
  const played = state === "SETTLED" || state === "FULL";
  const expiredNow = state === "OPEN" && now >= Number(g.expiresAt);
  const order = g.players.map((_, i) => i).sort((a, b) => (rr ? rr.totals[b] - rr.totals[a] : 0) || a - b);
  const m = rr?.matches[sel];
  const share = typeof window !== "undefined" ? `${window.location.origin}/m/${params.id}/${sel}` : "";

  return (
    <>
      <section style={{ padding: "32px 0 0" }}>
        <div className="row between">
          <div>
            <span className="label">
              TABLE #{params.id} · {TIER_PART[g.tier]} · {g.tier === 2 ? "CHAMPION CHALLENGE" : "ROUND ROBIN"}
            </span>
            <h1 style={{ marginTop: 8, fontSize: "clamp(30px, 5vw, 48px)" }}>
              {TIERS[g.tier]} #{params.id}
            </h1>
          </div>
          <div className="col gap-4" style={{ alignItems: "flex-end" }}>
            <StateLabel state={g.state} />
            <span className="mono" style={{ fontSize: 13 }}>
              {state === "OPEN" ? `CLOSES IN ${fmtLeft(Number(g.expiresAt), now)}` : state === "FULL" ? "READY TO SETTLE" : ""}
            </span>
          </div>
        </div>
      </section>

      <div className="grid-2" style={{ marginTop: 20, alignItems: "start" }}>
        <div className="panel pad col gap-16">
          <ChipSeat tier={g.tier} game={g} onTake={state === "OPEN" && mine < 0 ? () => setSheet(true) : undefined} />
          <PoolValue g={g} />
          <div className="row">
            {state === "OPEN" && mine < 0 && !expiredNow && g.tier !== 2 && (
              <button className="btn lg" onClick={() => setSheet(true)}>
                TAKE A SEAT
              </button>
            )}
            {state === "FULL" && g.tier !== 2 && (
              <button className="btn lg" disabled={tx.busy} onClick={() => tx.send({ address: ADDR.arena, abi: arenaAbi, functionName: "settle", args: [id] }).catch(() => {})}>
                SETTLE · ANYONE
              </button>
            )}
            {expiredNow && (
              <button className="btn lg outline" disabled={tx.busy} onClick={() => tx.send({ address: ADDR.arena, abi: arenaAbi, functionName: "expire", args: [id] }).catch(() => {})}>
                EXPIRE · ANYONE
              </button>
            )}
            {(state === "EXPIRED" || expiredNow) && mine >= 0 && (
              <button className="btn lg outline" disabled={tx.busy} onClick={() => tx.send({ address: ADDR.arena, abi: arenaAbi, functionName: "claimRefund", args: [id] }).catch(() => {})}>
                REFUND MY {ASSETS[g.assets[mine]]}
              </button>
            )}
          </div>
          {tx.status}
          {state === "OPEN" && <RiskBanner />}
        </div>

        <div className="panel">
          {!played ? (
            <div className="pad col gap-8">
              <span className="label">STANDINGS</span>
              <div className="mono" style={{ fontSize: 22, fontWeight: 700 }}>
                WAITING {g.players.length}/{g.size}
              </div>
              <p className="ink3" style={{ margin: 0, fontSize: 14 }}>
                Matches run when the last seat fills. Seated so far:
              </p>
              <div className="col">
                {g.players.map((p, i) => (
                  <div key={p} className="row between mono" style={{ fontSize: 13, padding: "10px 0", borderBottom: "1px solid var(--line-3)" }}>
                    <a href={bscscan(p)} target="_blank" rel="noreferrer" style={{ color: "var(--ink)", fontWeight: 600 }}>
                      {name(i)}
                    </a>
                    <span className="muted">
                      #{String(g.circuits[i])} {STARTER_NAMES[Number(g.circuits[i])] ?? ""}
                    </span>
                  </div>
                ))}
                {Array.from({ length: g.size - g.players.length }, (_, k) => (
                  <div key={k} className="mono muted" style={{ fontSize: 13, padding: "10px 0", borderBottom: "1px solid var(--line-3)" }}>
                    open seat
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="tbl-wrap" style={{ border: 0 }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>RANK</th>
                    <th>AGENT</th>
                    <th>CIRCUIT</th>
                    <th>SCORE</th>
                    <th>PAID</th>
                  </tr>
                </thead>
                <tbody>
                  {order.map((i, r) => (
                    <tr key={g.players[i]} className={g.players[i] === g.winner ? "sel" : ""}>
                      <td>{String(r + 1).padStart(2, "0")}</td>
                      <td style={{ fontWeight: 600 }}>
                        {name(i)} {g.players[i] === g.winner && <span className="c-coop">· WINNER</span>}
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
                TIE-BREAK: TOTAL → HEAD-TO-HEAD → EARLIEST ENTRY
              </p>
            </div>
          )}
        </div>
      </div>

      {played && rr && m && (
        <section className="section">
          <div className="section-head">
            <div>
              <span className="label">REPLAY · MATCH {String(sel + 1).padStart(2, "0")}/{rr.matches.length}</span>
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
                  <th>SCORE</th>
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
                        REPLAY
                      </button>{" "}
                      <Link href={`/m/${params.id}/${k}`} className="btn ghost" style={{ minHeight: 36 }}>
                        LINK
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <EntrySheet open={sheet} onClose={() => setSheet(false)} tier={g.tier} mode={g.tier === 2 ? "accept" : "enter"} challengeId={g.tier === 2 ? id : undefined} />
    </>
  );
}
