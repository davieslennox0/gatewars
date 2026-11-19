"use client";
import { useEffect, useMemo, useState } from "react";
import { movesString } from "@gatewars/compiler";
import { ADDR, arenaAbi, ASSETS, bscscan, displayName, STARTERS, STATES, TIERS } from "@/lib/contracts";
import { roundRobin, useGame, useTables } from "@/lib/data";
import { fmtBnb, fmtUsd8, fmtUsdc, StatePill, useAgent, useCountdown, useTx } from "@/components/ui";

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

  if (!g) return <p className="muted">loading game #{params.id}…</p>;
  if (g.openedAt === 0) return <p>Game #{params.id} does not exist.</p>;
  const state = STATES[g.state];
  const name = (i: number) => displayName(g.handles[i], g.players[i]);
  const now = Math.floor(Date.now() / 1000);
  const mine = address ? g.players.findIndex((p) => p.toLowerCase() === address.toLowerCase()) : -1;
  const played = state === "SETTLED" || state === "FULL";

  return (
    <>
      <div className="row between">
        <h1>
          {TIERS[g.tier]} {g.tier === 2 ? "challenge" : "bracket"} #{params.id}
        </h1>
        <StatePill state={g.state} />
      </div>
      <p className="muted">
        {g.players.length}/{g.size} entrants · pool {fmtBnb(g.poolBnb)} + {fmtUsdc(g.poolUsdc)} ≈ <b className="ok">{fmtUsd8(g.poolUsd)}</b>
        {state === "OPEN" && <> · {countdown}</>}
      </p>

      <div className="row">
        {state === "FULL" && g.tier !== 2 && (
          <button disabled={tx.busy} onClick={() => tx.send({ address: ADDR.arena, abi: arenaAbi, functionName: "settle", args: [id] }).catch(() => {})}>
            Settle (anyone)
          </button>
        )}
        {state === "OPEN" && now >= Number(g.expiresAt) && (
          <button className="secondary" disabled={tx.busy} onClick={() => tx.send({ address: ADDR.arena, abi: arenaAbi, functionName: "expire", args: [id] }).catch(() => {})}>
            Expire (anyone)
          </button>
        )}
        {(state === "EXPIRED" || (state === "OPEN" && now >= Number(g.expiresAt))) && mine >= 0 && (
          <button className="secondary" disabled={tx.busy} onClick={() => tx.send({ address: ADDR.arena, abi: arenaAbi, functionName: "claimRefund", args: [id] }).catch(() => {})}>
            Refund my {ASSETS[g.assets[mine]]}
          </button>
        )}
      </div>
      {tx.status}

      <div className="card" style={{ marginTop: 14 }}>
        <h3>Entrants</h3>
        <table>
          <thead>
            <tr>
              <th>slot</th>
              <th>agent</th>
              <th>circuit</th>
              <th>paid</th>
              <th>{played ? "score" : "score (if it ran now)"}</th>
            </tr>
          </thead>
          <tbody>
            {g.players.map((p, i) => (
              <tr key={p}>
                <td>{i}</td>
                <td>
                  <a href={bscscan(p)} target="_blank" rel="noreferrer">
                    {name(i)}
                  </a>
                  {p === g.winner && <span className="ok"> ★ winner</span>}
                </td>
                <td>
                  #{String(g.circuits[i])} {STARTERS[Number(g.circuits[i])] ?? ""}
                </td>
                <td>{g.assets[i] === 0 ? fmtBnb(g.paid[i], 6) : fmtUsdc(g.paid[i])}</td>
                <td>{rr ? rr.totals[i] : "…"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted" style={{ fontSize: 12 }}>Tie-break: total score → head-to-head score among the tied → earliest entry.</p>
      </div>

      {rr && rr.matches.length > 0 && (
        <div className="card" style={{ marginTop: 14 }}>
          <h3>{played ? "Match replay" : "Preview (matches have not been played on chain yet)"}</h3>
          {rr.matches.map((m) => (
            <Replay key={`${m.a}-${m.b}`} a={name(m.a)} b={name(m.b)} m={m} />
          ))}
        </div>
      )}
    </>
  );
}

function Replay({ a, b, m }: { a: string; b: string; m: { scoreA: number; scoreB: number; movesA: number; movesB: number } }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (step >= 20) return;
    const t = setTimeout(() => setStep((s) => s + 1), 90);
    return () => clearTimeout(t);
  }, [step]);
  const A = movesString(m.movesA);
  const B = movesString(m.movesB);
  return (
    <div style={{ margin: "12px 0" }}>
      <div className="row between" style={{ fontSize: 13 }}>
        <span>
          {a} <b>{m.scoreA}</b> – <b>{m.scoreB}</b> {b}
        </span>
        <button className="secondary" style={{ padding: "2px 8px", fontSize: 12 }} onClick={() => setStep(0)}>
          replay
        </button>
      </div>
      {[A, B].map((row, k) => (
        <div className="cells" key={k} style={{ marginTop: 3 }}>
          {Array.from(row).map((c, r) => (
            <div key={r} className={`cell ${r < step ? c : ""}`} title={`round ${r + 1}: ${c === "C" ? "cooperate" : "defect"}`} />
          ))}
        </div>
      ))}
    </div>
  );
}
