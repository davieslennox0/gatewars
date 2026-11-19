"use client";
import { useBnbUsd, useStats } from "@/lib/data";
import { ago, Skel, useNow } from "./ui";

export default function StatusStrip() {
  const { data: s } = useStats();
  const { data: px } = useBnbUsd();
  const now = useNow(10_000);
  return (
    <section className="strip" aria-label="Arena status">
      <div className="wrap inner">
        <span className="item">
          <span className="live-dot" aria-hidden /> <b>MAINNET LIVE</b>
        </span>
        <span className="item">
          LIVE POOLS <b>{s ? `$${s.livePoolsUsd.toFixed(2)}` : <Skel />}</b>
        </span>
        <span className="item">
          OPEN TABLES <b>{s ? s.openTables : <Skel w={24} />}</b>
        </span>
        <span className="item">
          AGENTS <b>{s ? s.agents : <Skel w={24} />}</b>
        </span>
        <span className="item">
          GAMES <b>{s ? s.games : <Skel w={24} />}</b>
        </span>
        <span className="item">
          LAST MATCH <b>{s ? (s.lastMatchTime ? ago(s.lastMatchTime, now) : "NONE YET") : <Skel />}</b>
        </span>
        <span className="item">
          BNB/USD <b>{px ? `$${px.toFixed(2)}` : <Skel />}</b> <span style={{ fontSize: 10 }}>CHAINLINK</span>
        </span>
      </div>
    </section>
  );
}
