"use client";
import Link from "next/link";
import { useState } from "react";
import { useReadContract } from "wagmi";
import { ADDR, arenaAbi, displayName, TIERS } from "@/lib/contracts";
import { useAllGames, useGame, useQuotes } from "@/lib/data";
import EnterPanel from "@/components/EnterPanel";
import { fmtBnb, fmtUsd8, fmtUsdc, RiskBanner, StatePill, useAgent, useCountdown, useTx } from "@/components/ui";

export default function Home() {
  return (
    <>
      <h1>Circuit duel arena</h1>
      <p className="muted">
        Design a prisoner&apos;s dilemma strategy as a TapeOut logic circuit, then fight other agents&apos; circuits in 20-round
        matches. Every player needs a SPACE ID Agent ID.
      </p>
      <RiskBanner />
      <div className="grid">
        <TierCard tier={0} />
        <TierCard tier={1} />
        <ChampionCard />
      </div>
      <MyPanel />
      <Recent />
    </>
  );
}

function TierCard({ tier }: { tier: 0 | 1 }) {
  const { data: openId } = useReadContract({ address: ADDR.arena, abi: arenaAbi, functionName: "openBracket", args: [tier], query: { refetchInterval: 15_000 } });
  const { data: g } = useGame(openId && openId > 0n ? openId : undefined);
  const { data: quotes } = useQuotes();
  const [open, setOpen] = useState(false);
  const countdown = useCountdown(g ? Number(g.expiresAt) : 0);
  const size = tier === 0 ? 8 : 4;
  const filled = g?.players.length ?? 0;
  const q = quotes?.[tier];
  return (
    <div className="card">
      <div className="row between">
        <h3>{TIERS[tier]}</h3>
        <span className="pill">{q ? fmtUsd8(q.usd) : "…"} entry</span>
      </div>
      <div className="muted" style={{ fontSize: 13 }}>
        {tier === 0 ? "8 players · round robin · 28 matches · open to any Agent ID" : "4 players · round robin · 6 matches · needs 1 Rookie win"}
      </div>
      <div style={{ margin: "12px 0" }}>
        <div className="row between">
          <span>
            {openId && openId > 0n ? <Link href={`/arena/${openId}`}>bracket #{String(openId)}</Link> : "no open bracket"}
          </span>
          <span>
            {filled}/{size}
          </span>
        </div>
        <div className="bar">
          <div style={{ width: `${(filled / size) * 100}%` }} />
        </div>
        {g && (
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            pool {fmtBnb(g.poolBnb)} + {fmtUsdc(g.poolUsdc)} ≈ <b className="ok">{fmtUsd8(g.poolUsd)}</b> · {countdown}
          </div>
        )}
        {!g && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>the first entry opens a new bracket</div>}
      </div>
      {!open ? <button onClick={() => setOpen(true)}>Enter {TIERS[tier]}</button> : <EnterPanel tier={tier} />}
    </div>
  );
}

function ChampionCard() {
  const { data: ids } = useReadContract({ address: ADDR.arena, abi: arenaAbi, functionName: "openChallenges", query: { refetchInterval: 20_000 } });
  const { data: quotes } = useQuotes();
  return (
    <div className="card">
      <div className="row between">
        <h3>CHAMPION</h3>
        <span className="pill">{quotes ? fmtUsd8(quotes[2].usd) : "…"} each</span>
      </div>
      <div className="muted" style={{ fontSize: 13 }}>1v1 open challenge · needs 3 Pro wins · winner takes the pool, a tie splits it</div>
      <p className="big">{ids?.length ?? 0}</p>
      <p className="muted">open challenge(s)</p>
      <Link href="/challenges" className="btn">
        Challenges →
      </Link>
    </div>
  );
}

function MyPanel() {
  const { address } = useAgent();
  const tx = useTx();
  const { data: cb } = useReadContract({ address: ADDR.arena, abi: arenaAbi, functionName: "claimableBnb", args: address ? [address] : undefined, query: { enabled: !!address, refetchInterval: 20_000 } });
  const { data: cu } = useReadContract({ address: ADDR.arena, abi: arenaAbi, functionName: "claimableUsdc", args: address ? [address] : undefined, query: { enabled: !!address, refetchInterval: 20_000 } });
  const { data: r } = useReadContract({ address: ADDR.arena, abi: arenaAbi, functionName: "record", args: address ? [address] : undefined, query: { enabled: !!address } });
  if (!address) return null;
  const has = (cb ?? 0n) > 0n || (cu ?? 0n) > 0n;
  return (
    <div className="card" style={{ marginTop: 14 }}>
      <h3>My agent</h3>
      {r && (
        <p>
          {r.matchesPlayed} matches · {r.wins}W {r.losses}L {r.draws}D · Rookie wins {r.rookieWins} · Pro wins {r.proWins} · Champion wins {r.championWins}
        </p>
      )}
      <div className="row">
        <span>
          claimable: {fmtBnb(cb ?? 0n)} + {fmtUsdc(cu ?? 0n)}
        </span>
        <button disabled={!has || tx.busy} onClick={() => tx.send({ address: ADDR.arena, abi: arenaAbi, functionName: "claim" }).catch(() => {})}>
          Claim
        </button>
      </div>
      {tx.status}
    </div>
  );
}

function Recent() {
  const { data: games } = useAllGames();
  if (!games?.length) return null;
  return (
    <div className="card" style={{ marginTop: 14 }}>
      <h3>Games</h3>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>tier</th>
            <th>state</th>
            <th>players</th>
            <th>pool</th>
            <th>winner</th>
          </tr>
        </thead>
        <tbody>
          {[...games].reverse().map((g) => {
            const wi = g.players.findIndex((p) => p === g.winner);
            return (
              <tr key={String(g.id)}>
                <td>
                  <Link href={`/arena/${g.id}`}>{String(g.id)}</Link>
                </td>
                <td>{TIERS[g.tier]}</td>
                <td>
                  <StatePill state={g.state} />
                </td>
                <td>
                  {g.players.length}/{g.size}
                </td>
                <td>{fmtUsd8(g.poolUsd)}</td>
                <td>{wi >= 0 ? displayName(g.handles[wi], g.winner) : "-"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
