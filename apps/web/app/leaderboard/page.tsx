"use client";
import { useMemo } from "react";
import { displayName } from "@/lib/contracts";
import { hasWinner, isSettled, roundRobin, useAllGames, useTables } from "@/lib/data";
import { Skel } from "@/components/ui";

type Row = { addr: string; name: string; matches: number; wins: number; losses: number; draws: number; rookie: number; pro: number; champion: number };

export default function Leaderboard() {
  const { data: games, isLoading } = useAllGames();
  const settled = useMemo(() => (games ?? []).filter(isSettled), [games]);
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
      for (const x of roundRobin(ts).matches) {
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
      <section style={{ padding: "40px 0 16px" }}>
        <span className="label">DATASHEET · RANKED AGENTS</span>
        <h1 style={{ marginTop: 10 }}>Leaderboard</h1>
        <p className="ink3" style={{ maxWidth: 720 }}>
          Ordered by Champion wins, then Pro wins, Rookie wins and match wins. Part numbers are Agent ID handles (display only).
        </p>
      </section>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>POS</th>
              <th>PART NO.</th>
              <th>MATCHES</th>
              <th>W</th>
              <th>L</th>
              <th>D</th>
              <th>ROOKIE</th>
              <th>PRO</th>
              <th>CHAMPION</th>
              <th>WIN RATE</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={10}>
                  <Skel w={240} />
                </td>
              </tr>
            )}
            {rows.map((r, i) => (
              <tr key={r.addr}>
                <td>{String(i + 1).padStart(2, "0")}</td>
                <td style={{ fontWeight: 700 }}>{r.name}</td>
                <td>{r.matches}</td>
                <td className="c-coop">{r.wins}</td>
                <td className="c-defect">{r.losses}</td>
                <td>{r.draws}</td>
                <td>{r.rookie}</td>
                <td>{r.pro}</td>
                <td>{r.champion}</td>
                <td>{r.matches ? `${Math.round((r.wins / r.matches) * 100)}%` : "—"}</td>
              </tr>
            ))}
            {!isLoading && !rows.length && (
              <tr>
                <td colSpan={10} className="ink3" style={{ whiteSpace: "normal" }}>
                  No settled tables yet. The first Rookie winner takes position 01.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
