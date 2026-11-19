"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { formatEther, formatUnits } from "viem";
import { RISK, STATES } from "@/lib/contracts";
import { RISK_ZH, useL, useLang } from "@/lib/i18n";

export const fmtBnb = (x: bigint, d = 4) => `${Number(formatEther(x)).toFixed(d)} BNB`;
export const fmtUsdc = (x: bigint) => `${Number(formatUnits(x, 18)).toFixed(2)} USDC`;
export const fmtUsd8 = (x: bigint) => `$${(Number(x) / 1e8).toFixed(2)}`;
export const TIER_PART = ["GW-R8", "GW-P4", "GW-C2"];
export const TIER_ZH = ["新手", "专业", "冠军"];

export function Skel({ w = 52 }: { w?: number }) {
  return (
    <span className="skel" style={{ width: w }} role="status">
      <span className="sr-only">loading</span>
    </span>
  );
}

/** Required risk copy on every entry surface. Chinese mode shows the translation and the exact English original. */
export function RiskBanner() {
  const { lang } = useLang();
  return (
    <div className="risk" role="note">
      <span className="tag">{lang === "zh" ? "风险" : "RISK"}</span>
      <span>
        {lang === "zh" ? (
          <>
            {RISK_ZH}
            <br />
            <span lang="en" style={{ fontSize: 12 }}>
              {RISK}
            </span>
          </>
        ) : (
          RISK
        )}
      </span>
    </div>
  );
}

const STATE_ZH: Record<string, string> = { NONE: "无", OPEN: "开放中", FULL: "已满员", SETTLED: "已结算", EXPIRED: "已过期" };

export function StateLabel({ state }: { state: number }) {
  const { lang } = useLang();
  const s = STATES[state] ?? "NONE";
  const color = s === "OPEN" ? "var(--coop)" : s === "EXPIRED" ? "var(--defect)" : "var(--ink-3)";
  return (
    <span className="label" style={{ color }}>
      {s === "OPEN" && <span className="live-dot" style={{ marginRight: 6 }} />}
      {lang === "zh" ? STATE_ZH[s] : s}
    </span>
  );
}

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function useLeft() {
  const L = useL();
  return (ts: number, now: number) => {
    if (!ts) return "—";
    const left = ts - now;
    if (left <= 0) return L("已过期", "EXPIRED");
    const h = Math.floor(left / 3600);
    const m = Math.floor((left % 3600) / 60);
    return L(`${h}小时${String(m).padStart(2, "0")}分`, `${String(h).padStart(2, "0")}H ${String(m).padStart(2, "0")}M`);
  };
}

export function useAgo() {
  const L = useL();
  return (ts: number, now: number) => {
    const d = Math.max(0, now - ts);
    if (d < 60) return L(`${d}秒前`, `${d}S AGO`);
    if (d < 3600) return L(`${Math.floor(d / 60)}分钟前`, `${Math.floor(d / 60)}M AGO`);
    if (d < 86400) return L(`${Math.floor(d / 3600)}小时前`, `${Math.floor(d / 3600)}H AGO`);
    return L(`${Math.floor(d / 86400)}天前`, `${Math.floor(d / 86400)}D AGO`);
  };
}

/**
 * Every action is done by the player's agent (GateWars skill + Binance Agentic Wallet), never by this site.
 * Shows the exact command to give the agent, with a copy button.
 */
export function AgentCommand({ cmd, note }: { cmd: string; note?: string }) {
  const L = useL();
  const [copied, setCopied] = useState(false);
  return (
    <div className="col gap-8">
      <span className="label">{L("交给你的智能体执行", "GIVE THIS TO YOUR AGENT")}</span>
      <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
        <code className="code" style={{ flex: 1, minWidth: 0, overflowX: "auto", whiteSpace: "nowrap", wordBreak: "normal" }}>
          {cmd}
        </code>
        <button
          className="btn outline"
          onClick={() =>
            navigator.clipboard.writeText(cmd).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            })
          }
        >
          {copied ? L("已复制", "COPIED") : L("复制", "COPY")}
        </button>
      </div>
      <span className="ink3" style={{ fontSize: 12 }}>
        {note ??
          L(
            "智能体会先生成钱包预览，经你确认后才会发送交易。",
            "Your agent builds a wallet preview first and only sends after you confirm it.",
          )}{" "}
        <Link href="/agents">{L("如何让智能体参赛 →", "How agents play →")}</Link>
      </span>
    </div>
  );
}
