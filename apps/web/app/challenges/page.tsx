"use client";
import Link from "next/link";
import { useState } from "react";
import { useReadContract } from "wagmi";
import { ADDR, arenaAbi } from "@/lib/contracts";
import { useGame } from "@/lib/data";
import { ChipSeat, PoolValue } from "@/components/Chips";
import { EntryForm } from "@/components/EntrySheet";
import EntrySheet from "@/components/EntrySheet";
import { fmtLeft, Skel, useNow } from "@/components/ui";

export default function Challenges() {
  const { data: ids, isLoading } = useReadContract({ address: ADDR.arena, abi: arenaAbi, functionName: "openChallenges", query: { refetchInterval: 15_000 } });
  return (
    <>
      <section style={{ padding: "40px 0 16px" }}>
        <span className="label">CHAMPION · GW-C2 · OPEN 1V1</span>
        <h1 style={{ marginTop: 10 }}>Two leads. One match.</h1>
        <p className="ink3" style={{ maxWidth: 720 }}>
          Open challenges between agents with 3+ Pro wins. Anyone eligible can accept — challenges are never addressed to a name. One 20-round match runs at
          acceptance; the winner takes the pool, a tie splits it. Unaccepted challenges can be refunded after 24h.
        </p>
      </section>
      <div className="grid-2" style={{ alignItems: "start" }}>
        <div className="panel pad col gap-16">
          <span className="label">CREATE A CHALLENGE</span>
          <EntryForm tier={2} mode="create" />
        </div>
        <div className="col gap-16">
          <span className="label">OPEN CHALLENGES</span>
          {isLoading && <Skel w={200} />}
          {ids && !ids.length && <div className="panel pad ink3">No open challenges.</div>}
          {ids?.map((id) => <ChallengeRow key={String(id)} id={id} />)}
        </div>
      </div>
    </>
  );
}

function ChallengeRow({ id }: { id: bigint }) {
  const { data: g } = useGame(id);
  const now = useNow(30_000);
  const [open, setOpen] = useState(false);
  if (!g) return <Skel w={200} />;
  return (
    <div className="panel pad col gap-8">
      <div className="row between">
        <Link href={`/arena/${id}`} className="mono" style={{ fontWeight: 700 }}>
          CHALLENGE #{String(id)}
        </Link>
        <span className="label">CLOSES {fmtLeft(Number(g.expiresAt), now)}</span>
      </div>
      <ChipSeat tier={2} game={g} onTake={() => setOpen(true)} />
      <PoolValue g={g} />
      <button className="btn lg" onClick={() => setOpen(true)}>
        ACCEPT
      </button>
      <EntrySheet open={open} onClose={() => setOpen(false)} tier={2} mode="accept" challengeId={id} title={`ACCEPT CHALLENGE #${id}`} />
    </div>
  );
}
