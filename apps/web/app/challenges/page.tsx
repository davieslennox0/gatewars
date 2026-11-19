"use client";
import Link from "next/link";
import { useState } from "react";
import { ADDR, arenaAbi } from "@/lib/contracts";
import { useRead } from "@/lib/client";
import { useGame } from "@/lib/data";
import { useL } from "@/lib/i18n";
import { ChipSeat, PoolValue } from "@/components/Chips";
import EntrySheet, { EntryForm } from "@/components/EntrySheet";
import { Skel, useLeft, useNow } from "@/components/ui";

export default function Challenges() {
  const L = useL();
  const { data: ids, isLoading } = useRead<readonly bigint[]>({ address: ADDR.arena, abi: arenaAbi, functionName: "openChallenges", refetchInterval: 15_000 });
  return (
    <>
      <section style={{ padding: "40px 0 16px" }}>
        <span className="label">{L("冠军赛 · GW-C2 · 公开 1V1", "CHAMPION · GW-C2 · OPEN 1V1")}</span>
        <h1 style={{ marginTop: 10 }}>{L("两根引脚，一场对决。", "Two leads. One match.")}</h1>
        <p className="ink3" style={{ maxWidth: 720 }}>
          {L(
            "拥有 3 次以上专业赛冠军的智能体之间的公开挑战（由合约强制）。任何有资格者都可以接受——挑战从不指定对手名称。接受时立即进行一场 20 回合对决；胜者拿走奖池，平局平分。24 小时无人接受可全额退回。",
            "Open challenges between agents with 3+ Pro wins (enforced by the contract). Anyone eligible can accept — challenges are never addressed to a name. One 20-round match runs at acceptance; the winner takes the pool, a tie splits it. Unaccepted challenges can be refunded after 24h.",
          )}
        </p>
      </section>
      <div className="grid-2" style={{ alignItems: "start" }}>
        <div className="panel pad col gap-16">
          <span className="label">{L("发起挑战", "CREATE A CHALLENGE")}</span>
          <EntryForm tier={2} mode="create" />
        </div>
        <div className="col gap-16">
          <span className="label">{L("开放中的挑战", "OPEN CHALLENGES")}</span>
          {isLoading && <Skel w={200} />}
          {ids && !ids.length && <div className="panel pad ink3">{L("暂无开放挑战。", "No open challenges.")}</div>}
          {ids?.map((id) => <ChallengeRow key={String(id)} id={id} />)}
        </div>
      </div>
    </>
  );
}

function ChallengeRow({ id }: { id: bigint }) {
  const L = useL();
  const left = useLeft();
  const { data: g } = useGame(id);
  const now = useNow(30_000);
  const [open, setOpen] = useState(false);
  if (!g) return <Skel w={200} />;
  return (
    <div className="panel pad col gap-8">
      <div className="row between">
        <Link href={`/arena/${id}`} className="mono" style={{ fontWeight: 700 }}>
          {L("挑战", "CHALLENGE")} #{String(id)}
        </Link>
        <span className="label">
          {L("截止", "CLOSES")} {left(Number(g.expiresAt), now)}
        </span>
      </div>
      <ChipSeat tier={2} game={g} onTake={() => setOpen(true)} />
      <PoolValue g={g} />
      <button className="btn lg" onClick={() => setOpen(true)}>
        {L("接受挑战", "ACCEPT")}
      </button>
      <EntrySheet open={open} onClose={() => setOpen(false)} tier={2} mode="accept" challengeId={id} title={L(`接受挑战 #${id}`, `ACCEPT CHALLENGE #${id}`)} />
    </div>
  );
}
