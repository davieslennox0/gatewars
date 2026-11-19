"use client";
import { useEffect, useMemo, useState } from "react";
import { movesString } from "@gatewars/compiler";
import { ADDR, arenaAbi, ASSETS, bscscan, displayName, STARTERS, STATES, TIERS } from "@/lib/contracts";
import { roundRobin, useGame, useTables } from "@/lib/data";
import { Avatar, fmtBnb, fmtUsd8, fmtUsdc, StatePill, TIER_KEY, TierIcon, useAgent, useCountdown, useTx } from "@/components/ui";

export default function ArenaPage({ params }: { params: { id: string } }) {
  const id = BigInt(params.id);
  const { data: g, refetch } = useGame(id);
  const { data: tables } = useTables(g?.circuits);
  const { address } = useAgent();
  const tx = useTx();
  const countdown = useCountdown(g ? Number(g.expiresAt) : 0);
  useEffect(() => {
    if (tx.receipt) refetch();
  }, [tx.receipt, refetch]);

  const rr = useMemo(() => {
    if (!g || !tables) return null;
    const ts = g.circuits.map((c) => tables[String(c)]);
    if (ts.some((t) => t === undefined)) return null;
    return roundRobin(ts);
  }, [g, tables]);

  if (!g) return <p className="muted" style={{ marginTop: 40 }}>loading game #{params.id}…</p>;
  if (g.openedAt === 0) return <p style={{ marginTop: 40 }}>Game #{params.id} does not exist.</p>;
  const state = STATES[g.state];
  const name = (i: number) => displayName(g.handles[i], g.players[i]);
  const now = Math.floor(Date.now() / 1000);
  const mine = address ? g.players.findIndex((p) => p.toLowerCase() === address.toLowerCase()) : -1;
  const played = state === "SETTLED" || state === "FULL";
  const order = g.players.map((_, i) => i).sort((a, b) => (rr ? rr.totals[b] - rr.totals[a] : 0) || a - b);
  const top = rr ? Math.max(1, ...rr.totals) : 1;
  const accent = ["var(--rookie)", "var(--pro)", "var(--champ)"][g.tier];

  return (
    <>
      <section className={`card glow gate ${TIER_KEY[g.tier]}`} style={{ marginTop: 28, minHeight: 0 }}>
        <div className="row between">
          <div className="row">
            <div className="badge">
              <TierIcon tier={g.tier} size={28} />
            </div>
            <div>
              <div className="eyebrow">{g.tier === 2 ? "champion challenge" : "bracket"}</div>
              <h1 style={{ fontSize: 34 }}>
                {TIERS[g.tier]} #{params.id}
              </h1>
            </div>
          </div>
          <div className="stack" style={{ alignItems: "flex-end" }}>
            <StatePill state={g.state} />
            {state === "OPEN" && <span className="mono dim" style={{ fontSize: 12 }}>⏱ {countdown}</span>}
          </div>
        </div>
        <div className="row" style={{ gap: 28 }}>
          <div className="pool">
            <span className="usd">{fmtUsd8(g.poolUsd)}</span>
            <span className="muted" style={{ fontSize: 12 }}>
              pool · {fmtBnb(g.poolBnb, 4)} + {fmtUsdc(g.poolUsdc)}
            </span>
          </div>
          <span className="mono">
            {g.players.length}/{g.size} <span className="muted">seats</span>
          </span>
          <div className="row" style={{ marginLeft: "auto" }}>
            {state === "FULL" && g.tier !== 2 && (
              <button disabled={tx.busy} onClick={() => tx.send({ address: ADDR.arena, abi: arenaAbi, functionName: "settle", args: [id] }).catch(() => {})}>
                ⚡ Settle (anyone)
              </button>
            )}
            {state === "OPEN" && now >= Number(g.expiresAt) && (
              <button className="ghost" disabled={tx.busy} onClick={() => tx.send({ address: ADDR.arena, abi: arenaAbi, functionName: "expire", args: [id] }).catch(() => {})}>
                Expire (anyone)
              </button>
            )}
            {(state === "EXPIRED" || (state === "OPEN" && now >= Number(g.expiresAt))) && mine >= 0 && (
              <button className="volt" disabled={tx.busy} onClick={() => tx.send({ address: ADDR.arena, abi: arenaAbi, functionName: "claimRefund", args: [id] }).catch(() => {})}>
                Refund my {ASSETS[g.assets[mine]]}
              </button>
            )}
          </div>
        </div>
        {tx.status}
      </section>

      <div className="section-title">
        <h2>{played ? "Standings" : "Standings if it ran now"}</h2>
        <span className="eyebrow">tie-break: total → head-to-head → earliest entry</span>
      </div>
      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>rank</th>
              <th>agent</th>
              <th>circuit</th>
              <th style={{ width: "30%" }}>score</th>
              <th>paid</th>
            </tr>
          </thead>
          <tbody>
            {order.map((i, r) => {
              const p = g.players[i];
              const win = p === g.winner;
              return (
                <tr key={p}>
                  <td>
                    <span className={`rank ${played && r < 3 ? `r${r + 1}` : ""}`}>{r + 1}</span>
                  </td>
                  <td>
                    <span className="row" style={{ gap: 10 }}>
                      <Avatar addr={p} size={28} />
                      <a href={bscscan(p)} target="_blank" rel="noreferrer" className="name" style={{ color: "var(--text)" }}>
                        {name(i)}
                      </a>
                      {win && <span className="pill" style={{ color: "var(--gold)" }}>★ WINNER</span>}
                    </span>
                  </td>
                  <td className="mono">
                    #{String(g.circuits[i])} <span className="dim">{STARTERS[Number(g.circuits[i])] ?? ""}</span>
                  </td>
                  <td>
                    <div className="row" style={{ gap: 10, flexWrap: "nowrap" }}>
                      <span className="mono" style={{ width: 36 }}>
                        {rr ? rr.totals[i] : "…"}
                      </span>
                      <div className="meter" style={{ flex: 1 }}>
                        <i style={{ width: `${rr ? (rr.totals[i] / top) * 100 : 0}%`, background: win ? "var(--gold)" : undefined }} />
                      </div>
                    </div>
                  </td>
                  <td className="mono muted">{g.assets[i] === 0 ? fmtBnb(g.paid[i], 5) : fmtUsdc(g.paid[i])}</td>
                </tr>
              );
            })}
            {Array.from({ length: g.size - g.players.length }, (_, k) => (
              <tr key={`e${k}`}>
                <td>
                  <span className="rank">{g.players.length + k + 1}</span>
                </td>
                <td colSpan={4} className="dim">
                  open seat
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rr && rr.matches.length > 0 && (
        <>
          <div className="section-title">
            <h2>{played ? "Match replays" : "Preview matches"}</h2>
            <span className="eyebrow">{rr.matches.length} matches · 20 rounds each</span>
          </div>
          <div className="grid-2">
            {rr.matches.map((m) => (
              <Replay key={`${m.a}-${m.b}`} accent={accent} pa={g.players[m.a]} pb={g.players[m.b]} a={name(m.a)} b={name(m.b)} m={m} />
            ))}
          </div>
        </>
      )}
    </>
  );
}

function Replay({ a, b, pa, pb, m, accent }: { a: string; b: string; pa: string; pb: string; accent: string; m: { scoreA: number; scoreB: number; movesA: number; movesB: number } }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (step >= 20) return;
    const t = setTimeout(() => setStep((s) => s + 1), 110);
    return () => clearTimeout(t);
  }, [step]);
  const A = movesString(m.movesA);
  const B = movesString(m.movesB);
  const aw = m.scoreA > m.scoreB;
  const bw = m.scoreB > m.scoreA;
  return (
    <div className="card match" style={{ "--accent": accent } as React.CSSProperties}>
      <div className="versus">
        <div className="side">
          <Avatar addr={pa} size={28} />
          <span className="name" style={{ color: aw ? "var(--text)" : "var(--muted)" }}>
            {a}
          </span>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <span className={`score ${aw ? "ok" : ""}`}>{step >= 20 ? m.scoreA : "–"}</span>
          <span className="vs">VS</span>
          <span className={`score ${bw ? "ok" : ""}`}>{step >= 20 ? m.scoreB : "–"}</span>
        </div>
        <div className="side right">
          <span className="name" style={{ color: bw ? "var(--text)" : "var(--muted)" }}>
            {b}
          </span>
          <Avatar addr={pb} size={28} />
        </div>
      </div>
      {[A, B].map((row, k) => (
        <div className="lane" key={k} style={{ marginTop: k ? 4 : 12 }}>
          {Array.from(row).map((c, r) => (
            <div key={r} className={`pip ${r < step ? c : ""}`} title={`round ${r + 1}: ${c === "C" ? "cooperate" : "defect"}`} />
          ))}
        </div>
      ))}
      <div className="row between" style={{ marginTop: 10 }}>
        <span className="mono dim" style={{ fontSize: 11 }}>
          {A.split("").filter((x) => x === "C").length}C / {B.split("").filter((x) => x === "C").length}C cooperations
        </span>
        <button className="sm ghost" onClick={() => setStep(0)}>
          ↻ replay
        </button>
      </div>
    </div>
  );
}
