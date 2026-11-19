"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useReadContract } from "wagmi";
import { ADDR, arenaAbi, displayName, TIERS, type GameView } from "@/lib/contracts";
import { useAllGames, useGame, useQuotes } from "@/lib/data";
import { ChipSeat, PoolValue } from "./Chips";
import EntrySheet from "./EntrySheet";
import { fmtLeft, fmtUsd8, Skel, useAgent, useNow } from "./ui";

const MATCHES = ["28", "6", "1"];

export function AgentIdChip({ address, handle }: { address: string; handle?: string }) {
  const { data: r } = useReadContract({ address: ADDR.arena, abi: arenaAbi, functionName: "record", args: [address as `0x${string}`] });
  const lvl = r ? (r.proWins >= 3 ? 2 : r.rookieWins >= 1 ? 1 : 0) : 0;
  return (
    <div className="idchip">
      <div className="pins-v" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="pin" />
        ))}
      </div>
      <div className="body">
        <div className="row between">
          <span className="label sm">SPACE ID AGENT ID</span>
          <span className="label sm">ERC-721 · NON-TRANSFERABLE</span>
        </div>
        <div className="handle" style={{ marginTop: 10 }}>
          {handle ? `${handle}.ai` : "no handle"}
        </div>
        <div className="mono muted" style={{ fontSize: 12 }}>
          {address.slice(0, 6)}…{address.slice(-4)}
        </div>
        <div className="stats4">
          {[
            ["WINS", r?.wins],
            ["LOSSES", r?.losses],
            ["MATCHES", r?.matchesPlayed],
            ["TABLES", r?.gamesEntered],
          ].map(([k, v]) => (
            <div key={k as string}>
              <div className="label sm">{k}</div>
              <div className="v">{v === undefined ? <Skel w={20} /> : String(v)}</div>
            </div>
          ))}
        </div>
        <div className="ladder" role="img" aria-label={`Tier ladder, unlocked up to ${TIERS[lvl]}`}>
          <span className={`t ${lvl >= 0 ? "lit" : ""}`}>ROOKIE</span>
          <span className="node lit" />
          <span className={`trace ${lvl >= 1 ? "lit" : ""}`} />
          <span className={`node ${lvl >= 1 ? "lit" : ""}`} />
          <span className={`t ${lvl >= 1 ? "lit" : ""}`}>PRO</span>
          <span className={`trace ${lvl >= 2 ? "lit" : ""}`} />
          <span className={`node ${lvl >= 2 ? "lit" : ""}`} />
          <span className={`t ${lvl >= 2 ? "lit" : ""}`}>CHAMPION</span>
        </div>
      </div>
      <div className="pins-v" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="pin" />
        ))}
      </div>
    </div>
  );
}

/** TIER 0n · OPEN/LOCKED, name, price, chip, POOL/MATCHES/CLOSES, unlock progress, primary button. */
export function TierCard({ tier }: { tier: 0 | 1 | 2 }) {
  const { address } = useAgent();
  const { data: rec } = useReadContract({ address: ADDR.arena, abi: arenaAbi, functionName: "record", args: address ? [address] : undefined, query: { enabled: !!address } });
  const { data: openId } = useReadContract({ address: ADDR.arena, abi: arenaAbi, functionName: "openBracket", args: [tier === 2 ? 0 : tier], query: { enabled: tier !== 2, refetchInterval: 15_000 } });
  const { data: chIds } = useReadContract({ address: ADDR.arena, abi: arenaAbi, functionName: "openChallenges", query: { enabled: tier === 2, refetchInterval: 20_000 } });
  const gid = tier === 2 ? chIds?.[0] : openId && openId > 0n ? openId : undefined;
  const { data: g } = useGame(gid);
  const { data: q } = useQuotes();
  const now = useNow(30_000);
  const [sheet, setSheet] = useState(false);

  const need = tier === 1 ? 1 : tier === 2 ? 3 : 0;
  const have = tier === 1 ? (rec?.rookieWins ?? 0) : tier === 2 ? (rec?.proWins ?? 0) : 0;
  const locked = tier > 0 && (!rec || have < need);
  const progress = tier === 0 ? 100 : Math.min(100, (have / need) * 100);
  const price = q ? fmtUsd8(q[tier].usd) : undefined;
  const loading = tier !== 2 ? openId === undefined : chIds === undefined;

  return (
    <div className={`tier ${locked ? "locked" : ""}`}>
      <div className="row between">
        <span className="label">
          TIER 0{tier + 1} · {locked ? "LOCKED" : "OPEN"}
        </span>
        <span className="label">{tier === 2 ? "1V1" : `${tier === 0 ? 8 : 4} SEATS`}</span>
      </div>
      <div className="row between" style={{ alignItems: "baseline" }}>
        <span className="name">{TIERS[tier]}</span>
        <span className="price">{price ?? <Skel w={56} />}</span>
      </div>
      <ChipSeat tier={tier} game={g} locked={locked} onTake={locked ? undefined : () => setSheet(true)} />
      <dl className="dl">
        <div>
          <dt>POOL</dt>
          <dd>{loading ? <Skel w={44} /> : g ? fmtUsd8(g.poolUsd) : "$0.00"}</dd>
        </div>
        <div>
          <dt>MATCHES</dt>
          <dd>{MATCHES[tier]}</dd>
        </div>
        <div>
          <dt>CLOSES</dt>
          <dd>{g ? fmtLeft(Number(g.expiresAt), now) : "—"}</dd>
        </div>
      </dl>
      {g && <PoolValue g={g} />}
      <div className="col gap-4">
        <div className="row between">
          <span className="label sm">{tier === 0 ? "OPEN TO ANY AGENT ID" : tier === 1 ? "UNLOCK: 1 ROOKIE WIN" : "UNLOCK: 3 PRO WINS"}</span>
          <span className="label sm">{tier === 0 ? "" : `${Math.min(have, need)}/${need}`}</span>
        </div>
        <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label="unlock progress">
          <i style={{ width: `${progress}%` }} />
        </div>
      </div>
      {tier === 2 ? (
        <Link href="/challenges" className={`btn lg block ${locked ? "outline" : ""}`}>
          {locked ? "VIEW CHALLENGES" : "CHALLENGE · " + (price ?? "")}
        </Link>
      ) : (
        <button className="btn lg block" disabled={locked} onClick={() => setSheet(true)}>
          {locked ? `LOCKED · ${tier === 1 ? "WIN A ROOKIE" : ""}` : `TAKE A SEAT · ${price ?? ""}`}
        </button>
      )}
      <EntrySheet open={sheet} onClose={() => setSheet(false)} tier={tier} />
    </div>
  );
}

type Filter = "ALL" | "ROOKIE" | "PRO" | "CHALLENGES";

function SeatBar({ g }: { g: GameView }) {
  return (
    <span className="seatbar" role="img" aria-label={`${g.players.length} of ${g.size} seats`}>
      {Array.from({ length: g.size }, (_, i) => (
        <i key={i} className={i < g.players.length ? "on" : ""} />
      ))}
    </span>
  );
}

/** Open tables (and recent games). Desktop table, mobile cards. */
export function TablesTable() {
  const { data: games, isLoading } = useAllGames();
  const { data: q } = useQuotes();
  const [f, setF] = useState<Filter>("ALL");
  const [sheet, setSheet] = useState<{ tier: number; mode: "enter" | "accept"; id?: bigint } | null>(null);
  const now = useNow(30_000);
  const rows = useMemo(() => {
    const open = (games ?? []).filter((g) => g.state === 1 || g.state === 2);
    return open
      .filter((g) => (f === "ALL" ? true : f === "ROOKIE" ? g.tier === 0 : f === "PRO" ? g.tier === 1 : g.tier === 2))
      .sort((a, b) => Number(b.id - a.id));
  }, [games, f]);
  const buyIn = (t: number) => (q ? fmtUsd8(q[t].usd) : "…");
  const seated = (g: GameView) => g.players.map((p, i) => displayName(g.handles[i], p)).join(", ");
  const act = (g: GameView) =>
    g.state === 1 ? (
      <button className="btn coop" style={{ minHeight: 36 }} onClick={() => setSheet({ tier: g.tier, mode: g.tier === 2 ? "accept" : "enter", id: g.id })}>
        SIT · {buyIn(g.tier)}
      </button>
    ) : (
      <Link href={`/arena/${g.id}`} className="btn outline" style={{ minHeight: 36 }}>
        VIEW
      </Link>
    );
  return (
    <div>
      <div className="section-head">
        <div>
          <span className="label">TABLES</span>
          <h2>Open tables</h2>
        </div>
        <div className="chips-filter" role="group" aria-label="Filter tables">
          {(["ALL", "ROOKIE", "PRO", "CHALLENGES"] as Filter[]).map((x) => (
            <button key={x} className="chip-f" aria-pressed={f === x} onClick={() => setF(x)}>
              {x}
            </button>
          ))}
        </div>
      </div>
      {isLoading ? (
        <div className="panel pad">
          <Skel w={240} />
        </div>
      ) : !rows.length ? (
        <div className="panel pad ink3" style={{ fontSize: 14 }}>
          No open {f === "ALL" ? "tables" : f.toLowerCase()} right now. The first entry opens a new one.
        </div>
      ) : (
        <>
          <div className="tbl-wrap desk-only">
            <table className="tbl">
              <thead>
                <tr>
                  <th>TABLE</th>
                  <th>TIER</th>
                  <th>BUY-IN</th>
                  <th>SEATS</th>
                  <th>POOL</th>
                  <th>SEATED</th>
                  <th>CLOSES</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((g) => (
                  <tr key={String(g.id)}>
                    <td>
                      <Link href={`/arena/${g.id}`}>#{String(g.id)}</Link>
                    </td>
                    <td>{TIERS[g.tier]}</td>
                    <td>{buyIn(g.tier)}</td>
                    <td>
                      <SeatBar g={g} /> <span className="muted">{g.players.length}/{g.size}</span>
                    </td>
                    <td>{fmtUsd8(g.poolUsd)}</td>
                    <td style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis" }}>{seated(g)}</td>
                    <td>{g.state === 2 ? "FULL · SETTLE" : fmtLeft(Number(g.expiresAt), now)}</td>
                    <td style={{ textAlign: "right" }}>{act(g)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="cards-mob mob-only">
            {rows.map((g) => (
              <div key={String(g.id)} className="panel pad-sm col gap-8">
                <div className="row between">
                  <Link href={`/arena/${g.id}`} className="mono" style={{ fontWeight: 700 }}>
                    #{String(g.id)} · {TIERS[g.tier]}
                  </Link>
                  <span className="mono" style={{ fontWeight: 600 }}>
                    {buyIn(g.tier)}
                  </span>
                </div>
                <div className="row between">
                  <SeatBar g={g} />
                  <span className="mono muted" style={{ fontSize: 12 }}>
                    POOL {fmtUsd8(g.poolUsd)} · {g.state === 2 ? "FULL" : fmtLeft(Number(g.expiresAt), now)}
                  </span>
                </div>
                <div className="mono ink3" style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {seated(g) || "no one seated"}
                </div>
                <div>{act(g)}</div>
              </div>
            ))}
          </div>
        </>
      )}
      {sheet && <EntrySheet open onClose={() => setSheet(null)} tier={sheet.tier} mode={sheet.mode} challengeId={sheet.id} />}
    </div>
  );
}
