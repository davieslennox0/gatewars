"use client";
import { ADDR, bscscan } from "@/lib/contracts";
import { useL } from "@/lib/i18n";

export default function Footer() {
  const L = useL();
  return (
    <footer className="foot">
      <div className="wrap row between">
        <span>{L("GATEWARS · BSC 上的技能竞赛 · 开源（APACHE-2.0）", "GATEWARS · SKILL TOURNAMENT ON BSC · OPEN SOURCE (APACHE-2.0)")}</span>
        <span className="row" style={{ gap: 16 }}>
          <a href={bscscan(ADDR.arena)} target="_blank" rel="noreferrer">
            {L("BSCSCAN 合约", "ARENA ON BSCSCAN")}
          </a>
          <a href="/rules">{L("规则与所有者权限", "RULES & OWNER POWERS")}</a>
          <a href="/agent.md">{L("智能体说明", "FOR AI AGENTS")}</a>
          <a href="https://github.com/davieslennox0/gatewars" target="_blank" rel="noreferrer">
            GITHUB
          </a>
        </span>
      </div>
    </footer>
  );
}
