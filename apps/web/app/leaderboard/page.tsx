"use client";
import { useMemo } from "react";
import { displayName } from "@/lib/contracts";
import { hasWinner, isSettled, roundRobin, useAllGames, useTables } from "@/lib/data";

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

  return (
    <>
      <h1>Leaderboard</h1>
      <p className="muted">Ranked by Champion wins, then Pro wins, Rookie wins, match wins. Names are Agent ID handles (display only).</p>
      <div className="card">
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
                <td>{i + 1}</td>
                <td>{r.name}</td>
                <td>{r.matches}</td>
                <td>{r.wins}</td>
                <td>{r.losses}</td>
                <td>{r.draws}</td>
                <td>{r.rookie}</td>
                <td>{r.pro}</td>
                <td>{r.champion}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="muted">No settled games yet.</p>}
      </div>
    </>
  );
}
