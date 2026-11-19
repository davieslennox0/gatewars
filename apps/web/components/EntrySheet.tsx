"use client";
import { useEffect, useRef, useState } from "react";
import { TIERS } from "@/lib/contracts";
import { useQuotes } from "@/lib/data";
import { useL } from "@/lib/i18n";
import { AgentCommand, fmtBnb, fmtUsd8, fmtUsdc, RiskBanner, Skel, TIER_ZH } from "./ui";

type Mode = "enter" | "create" | "accept";

/** Entry details + the exact command for the player's agent. The site itself never sends transactions. */
export function EntryForm({ tier, mode = "enter", challengeId }: { tier: number; mode?: Mode; challengeId?: bigint }) {
  const L = useL();
  const { data: quotes } = useQuotes();
  const q = quotes?.[tier];
  const [asset, setAsset] = useState<"bnb" | "usdc">("bnb");
  const [circuit, setCircuit] = useState("1");
  const cid = /^\d+$/.test(circuit) ? circuit : "1";
  const cmd =
    mode === "enter"
      ? `gatewars enter ${TIERS[tier].toLowerCase()} ${cid} ${asset}`
      : mode === "create"
        ? `gatewars challenge create ${cid} ${asset}`
        : `gatewars challenge accept ${challengeId} ${cid} ${asset}`;
  return (
    <div className="col gap-16">
      <div className="row" style={{ alignItems: "flex-end" }}>
        <div className="col gap-8">
          <span className="label">{L("支付方式", "PAY WITH")}</span>
          <div className="seg" role="group" aria-label={L("支付资产", "Payment asset")}>
            <button aria-pressed={asset === "bnb"} onClick={() => setAsset("bnb")}>
              BNB
            </button>
            <button aria-pressed={asset === "usdc"} onClick={() => setAsset("usdc")}>
              USDC
            </button>
          </div>
        </div>
        <label className="col gap-8">
          <span className="label">{L("电路编号", "CIRCUIT ID")}</span>
          <input type="text" inputMode="numeric" value={circuit} onChange={(e) => setCircuit(e.target.value)} style={{ width: 120, minHeight: 44 }} aria-describedby="cid-hint" />
        </label>
      </div>
      <span id="cid-hint" className="ink3" style={{ fontSize: 12 }}>
        {L("#1 以牙还牙 · #2 冷酷触发 · #3 永远背叛（任何人可用），或填你自己提交的电路编号。", "#1 TIT_FOR_TAT · #2 GRIM_TRIGGER · #3 ALWAYS_DEFECT (anyone may use), or your own circuit id.")}
      </span>
      <div className="panel-2 pad-sm mono" style={{ fontSize: 13 }}>
        {!q ? (
          <Skel w={180} />
        ) : asset === "bnb" ? (
          <>
            ≈ {fmtUsd8(q.usd)} ({fmtBnb(q.bnbWei, 4)}), {L("多付部分在同一笔交易中退回", "excess refunded")}
          </>
        ) : (
          <>
            {L("精确", "Exactly")} {fmtUsdc(q.usdc)} · {L("授权额度仅为报名费，绝不无限授权", "approval = entry amount only, never unlimited")}
          </>
        )}
      </div>
      <RiskBanner />
      <AgentCommand cmd={cmd} />
    </div>
  );
}

export default function EntrySheet({ open, onClose, tier, mode = "enter", challengeId, title }: { open: boolean; onClose: () => void; tier: number; mode?: Mode; challengeId?: bigint; title?: string }) {
  const L = useL();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    document.body.classList.add("scroll-lock");
    requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>("button")?.focus());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const f = Array.from(ref.current?.querySelectorAll<HTMLElement>("button:not([disabled]), input, a[href]") ?? []);
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) {
          e.preventDefault();
          f[f.length - 1].focus();
        } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) {
          e.preventDefault();
          f[0].focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.classList.remove("scroll-lock");
      prev?.focus();
    };
  }, [open, onClose]);
  if (!open) return null;
  const heading = title ?? L(`报名${TIER_ZH[tier]}赛`, `ENTER ${TIERS[tier]}`);
  return (
    <>
      <div className="backdrop" onClick={onClose} aria-hidden />
      <div className="sheet-bottom" role="dialog" aria-modal="true" aria-label={heading} ref={ref}>
        <div className="row between" style={{ marginBottom: 12 }}>
          <span className="label lg" style={{ color: "var(--ink)" }}>
            {heading}
          </span>
          <button className="btn ghost icon" aria-label={L("关闭", "Close")} onClick={onClose}>
            ✕
          </button>
        </div>
        <EntryForm tier={tier} mode={mode} challengeId={challengeId} />
      </div>
    </>
  );
}
