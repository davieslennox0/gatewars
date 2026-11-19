"use client";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePC as usePublicClient } from "@/lib/client";
import { useL } from "@/lib/i18n";
import { parseAbiItem } from "viem";
import { play, STARTERS as T } from "@gatewars/compiler";
import { ADDR, displayName, STARTER_NAMES, TIERS } from "@/lib/contracts";
import { API, hasWinner, isSettled, useAllGames } from "@/lib/data";
import { CircuitCard } from "@/components/Chips";
import DuelScope from "@/components/DuelScope";
import { Skel } from "@/components/ui";

type Sub = { id: number; owner: string; handle: string; gates: number; table: string; wins: { game: number; tier: string }[] };

/** CircuitSubmitted history: keeper API (indexed), chain getLogs fallback over a recent window. */
function useSubmitted() {
  const pc = usePublicClient();
  return useQuery({
    queryKey: ["submitted"],
    enabled: !!pc,
    refetchInterval: 60_000,
    queryFn: async (): Promise<Sub[]> => {
      if (API) {
        try {
          const r = await fetch(`${API}/circuits`, { signal: AbortSignal.timeout(8000) });
          if (r.ok) return (await r.json()).circuits as Sub[];
        } catch {}
      }
      const head = await pc!.getBlockNumber();
      const logs = await pc!.getLogs({ address: ADDR.registry, event: parseAbiItem("event CircuitSubmitted(uint256 indexed circuitId, address indexed owner, string handle, uint32 gateCount, uint64 table)"), fromBlock: head - 4000n, toBlock: head }).catch(() => []);
      return logs.map((l) => ({ id: Number(l.args.circuitId), owner: l.args.owner!, handle: l.args.handle!, gates: Number(l.args.gateCount), table: String(l.args.table), wins: [] }));
    },
  });
}

export default function Circuits() {
  const L = useL();
  const { data: subs, isLoading } = useSubmitted();
  const { data: games } = useAllGames();
  const winners = useMemo(() => {
    const out: { game: bigint; tier: number; circuit: number; who: string }[] = [];
    for (const g of games ?? []) {
      if (!isSettled(g) || !hasWinner(g)) continue;
      const i = g.players.findIndex((p) => p === g.winner);
      out.push({ game: g.id, tier: g.tier, circuit: Number(g.circuits[i]), who: displayName(g.handles[i], g.winner) });
    }
    return out.reverse();
  }, [games]);
  const byId = new Map((subs ?? []).map((s) => [s.id, s]));
  const champ = winners[0] ? byId.get(winners[0].circuit) : undefined;
  const champVsTft = champ ? play(BigInt(champ.table), T.TIT_FOR_TAT) : null;

  return (
    <>
      <section style={{ padding: "40px 0 16px" }}>
        <span className="label">{L("电路名人堂 · CIRCUITSUBMITTED 事件", "HALL OF CIRCUITS · CIRCUITSUBMITTED")}</span>
        <h1 style={{ marginTop: 10 }}>{L("所有流片过的芯片。", "Every chip ever taped out.")}</h1>
        <p className="ink3" style={{ maxWidth: 720 }}>{L("先展示冠军策略，再展示全部提交。真值表为缓存的 64 项输出；行代表对手最近 3 步。", "Winning strategies first, then every submission. Tables are the cached 64-entry outputs; read rows as the opponent's last 3 moves.")}</p>
      </section>

      {champ && champVsTft && (
        <section className="section" style={{ marginTop: 8 }}>
          <span className="label">{L("最新冠军", "LATEST WINNER")} · {TIERS[winners[0].tier]} #{String(winners[0].game)} · {winners[0].who}</span>
          <div style={{ marginTop: 10 }}>
            <DuelScope nameA={`#${champ.id}`} nameB="TIT_FOR_TAT" movesA={champVsTft.movesA} movesB={champVsTft.movesB} mode="replay" title={`${L("冠军", "WINNER")} #${champ.id} VS TIT_FOR_TAT`} />
          </div>
        </section>
      )}

      <section className="section">
        <div className="section-head">
          <h2>{L("全部提交", "Submissions")}</h2>
          <span className="label">{subs ? L(`${subs.length} 个电路`, `${subs.length} CIRCUITS`) : ""}</span>
        </div>
        {isLoading ? (
          <Skel w={240} />
        ) : (
          <div className="grid-3">
            {(subs ?? []).map((s) => {
              const wins = winners.filter((w) => w.circuit === s.id);
              const vs = play(BigInt(s.table), T.ALWAYS_DEFECT);
              return (
                <CircuitCard
                  key={s.id}
                  id={s.id}
                  gates={s.gates}
                  name={STARTER_NAMES[s.id] || (s.handle ? `${s.handle}.ai` : `${s.owner.slice(0, 6)}…`)}
                  table={BigInt(s.table)}
                  note={`${wins.length ? `★ ${L(`${wins.length} 次夺冠`, `${wins.length} WIN${wins.length > 1 ? "S" : ""}`)} · ` : ""}${L("对永远背叛", "vs ALWAYS_DEFECT")} ${vs.scoreA}–${vs.scoreB}`}
                />
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
