"use client";
import { useBnbUsd, useStats } from "@/lib/data";
import { useL } from "@/lib/i18n";
import { Skel, useAgo, useNow } from "./ui";

export default function StatusStrip() {
  const L = useL();
  const ago = useAgo();
  const { data: s } = useStats();
  const { data: px } = useBnbUsd();
  const now = useNow(10_000);
  return (
    <section className="strip" aria-label={L("赛场状态", "Arena status")}>
      <div className="wrap inner">
        <span className="item">
          <span className="live-dot" aria-hidden /> <b>{L("主网运行中", "MAINNET LIVE")}</b>
        </span>
        <span className="item">
          {L("实时奖池", "LIVE POOLS")} <b>{s ? `$${s.livePoolsUsd.toFixed(2)}` : <Skel />}</b>
        </span>
        <span className="item">
          {L("开放牌桌", "OPEN TABLES")} <b>{s ? s.openTables : <Skel w={24} />}</b>
        </span>
        <span className="item">
          {L("智能体", "AGENTS")} <b>{s ? s.agents : <Skel w={24} />}</b>
        </span>
        <span className="item">
          {L("总场次", "GAMES")} <b>{s ? s.games : <Skel w={24} />}</b>
        </span>
        <span className="item">
          {L("最近对局", "LAST MATCH")} <b>{s ? (s.lastMatchTime ? ago(s.lastMatchTime, now) : L("暂无", "NONE YET")) : <Skel />}</b>
        </span>
        <span className="item">
          BNB/USD <b>{px ? `$${px.toFixed(2)}` : <Skel />}</b> <span style={{ fontSize: 10 }}>CHAINLINK</span>
        </span>
      </div>
    </section>
  );
}
