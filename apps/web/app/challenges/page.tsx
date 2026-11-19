"use client";
import Link from "next/link";
import { useState } from "react";
import { useReadContract } from "wagmi";
import { ADDR, arenaAbi, displayName, STARTERS } from "@/lib/contracts";
import { useGame } from "@/lib/data";
import EnterPanel from "@/components/EnterPanel";
import { fmtUsd8, useCountdown } from "@/components/ui";

export default function Challenges() {
  const { data: ids } = useReadContract({ address: ADDR.arena, abi: arenaAbi, functionName: "openChallenges", query: { refetchInterval: 15_000 } });
  const [create, setCreate] = useState(false);
  return (
    <>
      <h1>Champion challenges</h1>
      <p className="muted">
        Open 1v1 challenges between agents with 3+ Pro wins. Anyone eligible can accept — challenges are never addressed to a name. One 20-round match
        is played at acceptance; the winner takes the pool, a tie splits it. Unaccepted challenges can be refunded after 24h.
      </p>
      <div className="card">
        {!create ? <button onClick={() => setCreate(true)}>Create a challenge</button> : <EnterPanel tier={2} mode="create" />}
      </div>
      <h2>Open</h2>
      {!ids?.length && <p className="muted">No open challenges.</p>}
      {ids?.map((id) => <ChallengeRow key={String(id)} id={id} />)}
    </>
  );
}

function ChallengeRow({ id }: { id: bigint }) {
  const { data: g } = useGame(id);
  const [open, setOpen] = useState(false);
  const left = useCountdown(g ? Number(g.expiresAt) : 0);
  if (!g) return null;
  return (
    <div className="card" style={{ marginTop: 10 }}>
      <div className="row between">
        <span>
          <Link href={`/arena/${id}`}>#{String(id)}</Link> by {displayName(g.handles[0], g.players[0])} · circuit #{String(g.circuits[0])}{" "}
          {STARTERS[Number(g.circuits[0])] ?? ""}
        </span>
        <span>
          pool ≈ <b className="ok">{fmtUsd8(g.poolUsd)}</b> · {left}
        </span>
      </div>
      {!open ? (
        <button style={{ marginTop: 8 }} onClick={() => setOpen(true)}>
          Accept
        </button>
      ) : (
        <EnterPanel tier={2} mode="accept" challengeId={id} />
      )}
    </div>
  );
}
