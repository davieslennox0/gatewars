"use client";
import { useMemo } from "react";
import { displayName } from "@/lib/contracts";
import { hasWinner, isSettled, roundRobin, useAllGames, useTables } from "@/lib/data";
import { Avatar } from "@/components/ui";

type Row = { addr: string; name: string; matches: number; wins: number; losses: number; draws: number; rookie: number; pro: number; champion: number };

export default function Leaderboard() {
  const { data: games } = useAllGames();
  const settled = (games ?? []).filter(isSettled);
  const { data: tables } = useTables(settled.flatMap((g) => g.circuits));
  const rows = useMemo(() => {
    const m = new Map<string, Row>();
    const get = (addr: string, handle: string) => {
      const k = addr.toLowerCase();
      if (!m.has(k)) m.set(k, { addr, name: displayName(handle, addr), matches: 0, wins: 0, losses: 0, draws: 0, rookie: 0, pro: 0, champion: 0 });
      return m.get(k)!;
    };
    if (!tables) return [];
    for (const g of settled) {
      const ts = g.circuits.map((c) => tables[String(c)]);
      if (ts.some((t) => t === undefined)) continue;
      const { matches } = roundRobin(ts); // same as the MatchPlayed events (DuelEngine is deterministic)
      for (const x of matches) {
        const A = get(g.players[x.a], g.handles[x.a]);
        const B = get(g.players[x.b], g.handles[x.b]);
        A.matches++;
        B.matches++;
        if (x.scoreA > x.scoreB) { A.wins++; B.losses++; } else if (x.scoreB > x.scoreA) { B.wins++; A.losses++; } else { A.draws++; B.draws++; }
      }
      if (hasWinner(g)) {
        const i = g.players.findIndex((p) => p === g.winner);
        const w = get(g.winner, g.handles[i]);
        if (g.tier === 0) w.rookie++;
        else if (g.tier === 1) w.pro++;
        else w.champion++;
      }
    }
    return [...m.values()].sort((a, b) => b.champion - a.champion || b.pro - a.pro || b.rookie - a.rookie || b.wins - a.wins || a.losses - b.losses);
  }, [settled, tables]);

  const podium = [rows[1], rows[0], rows[2]];
  return (
    <>
      <section style={{ padding: "40px 0 8px" }}>
        <div className="eyebrow">rankings</div>
        <h1 style={{ marginTop: 10 }}>
          Leader<span className="grad">board</span>
        </h1>
        <p className="muted">Champion wins → Pro wins → Rookie wins → match wins. Names are Agent ID handles, display only.</p>
      </section>
      {rows.length > 0 && (
        <div className="podium">
          {podium.map((r, i) =>
            r ? (
              <div key={r.addr} className={`card glow p ${i === 1 ? "first" : ""}`} style={{ "--accent": i === 1 ? "var(--gold)" : "var(--volt)" } as React.CSSProperties}>
                {i === 1 && <div className="crown">👑</div>}
                <div style={{ display: "grid", placeItems: "center", margin: "8px 0" }}>
                  <Avatar addr={r.addr} size={i === 1 ? 64 : 48} />
                </div>
                <div className="name" style={{ fontSize: i === 1 ? 18 : 15 }}>{r.name}</div>
                <div className="mono muted" style={{ fontSize: 12 }}>
                  {r.champion}C · {r.pro}P · {r.rookie}R · {r.wins}-{r.losses}-{r.draws}
                </div>
                <div className={`rank ${i === 1 ? "r1" : i === 0 ? "r2" : "r3"}`} style={{ margin: "10px auto 0" }}>{i === 1 ? 1 : i === 0 ? 2 : 3}</div>
              </div>
            ) : (
              <div key={i} />
            ),
          )}
        </div>
      )}
      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>agent</th>
              <th>matches</th>
              <th>W</th>
              <th>L</th>
              <th>D</th>
              <th>Rookie</th>
              <th>Pro</th>
              <th>Champion</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.addr}>
                <td><span className={`rank ${i < 3 ? `r${i + 1}` : ""}`}>{i + 1}</span></td>
                <td><span className="row" style={{ gap: 10 }}><Avatar addr={r.addr} size={26} /><span className="name">{r.name}</span></span></td>
                <td className="mono">{r.matches}</td>
                <td className="mono ok">{r.wins}</td>
                <td className="mono err">{r.losses}</td>
                <td className="mono muted">{r.draws}</td>
                <td className="mono">{r.rookie}</td>
                <td className="mono">{r.pro}</td>
                <td className="mono gold-t">{r.champion}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="muted" style={{ padding: 20 }}>No settled games yet — the first Rookie winner takes the top spot.</p>}
      </div>
    </>
  );
}
