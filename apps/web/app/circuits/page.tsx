"use client";
import Link from "next/link";
import { useMemo } from "react";
import { tableHex, vsStarters } from "@gatewars/compiler";
import { displayName, STARTERS, TIERS } from "@/lib/contracts";
import { hasWinner, isSettled, useAllGames, useNetlist, useTables } from "@/lib/data";

export default function Circuits() {
  const { data: games } = useAllGames();
  const winners = useMemo(() => {
    const out: { game: bigint; tier: number; circuit: bigint; who: string }[] = [];
    for (const g of games ?? []) {
      if (!isSettled(g) || !hasWinner(g)) continue;
      const i = g.players.findIndex((p) => p === g.winner);
      out.push({ game: g.id, tier: g.tier, circuit: g.circuits[i], who: displayName(g.handles[i], g.winner) });
    }
    return out;
  }, [games]);
  const { data: tables } = useTables(winners.map((w) => w.circuit));
  return (
    <>
      <h1>Hall of Circuits</h1>
      <p className="muted">Every winning strategy, in order — how the meta evolves. Tables are the cached 64-entry outputs; netlists are read from the TapeOut processor.</p>
      {!winners.length && <p className="muted">No settled games yet. The first winner lands here.</p>}
      {[...winners].reverse().map((w) => (
        <div className="card" key={String(w.game)} style={{ marginTop: 12 }}>
          <div className="row between">
            <h3>
              <Link href={`/arena/${w.game}`}>
                {TIERS[w.tier]} #{String(w.game)}
              </Link>
            </h3>
            <span>
              {w.who} · circuit #{String(w.circuit)} {STARTERS[Number(w.circuit)] ?? ""}
            </span>
          </div>
          {tables?.[String(w.circuit)] !== undefined && <WinnerDetail id={w.circuit} table={tables[String(w.circuit)]} />}
        </div>
      ))}
    </>
  );
}

function WinnerDetail({ id, table }: { id: bigint; table: bigint }) {
  const { data: netlist } = useNetlist(id);
  return (
    <>
      <p>
        table <span className="code">{tableHex(table)}</span> · vs starters:{" "}
        {vsStarters(table)
          .map((r) => `${r.opponent} ${r.you}-${r.them}`)
          .join(" · ")}
      </p>
      {netlist && (
        <div className="code" style={{ maxHeight: 70, overflow: "auto" }}>
          {netlist} ({(netlist.length - 2) / 14} gates)
        </div>
      )}
    </>
  );
}
