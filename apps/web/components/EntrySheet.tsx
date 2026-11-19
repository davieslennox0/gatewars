"use client";
import { useEffect, useRef, useState } from "react";
import { useReadContract } from "wagmi";
import { ADDR, arenaAbi, erc20Abi, registryAbi, STARTER_NAMES, TIERS } from "@/lib/contracts";
import { useQuotes } from "@/lib/data";
import { fmtBnb, fmtUsd8, fmtUsdc, RiskBanner, Skel, useAgent, useTx } from "./ui";

type Mode = "enter" | "create" | "accept";

/** Entry form (used inside the sheet and inline). BNB: quote × 1.01, excess refunded in-tx. USDC: exact approval, then entry. */
export function EntryForm({ tier, mode = "enter", challengeId, onDone }: { tier: number; mode?: Mode; challengeId?: bigint; onDone?: () => void }) {
  const { address, hasAgentId } = useAgent();
  const { data: quotes } = useQuotes();
  const q = quotes?.[tier];
  const [circuit, setCircuit] = useState("1");
  const [asset, setAsset] = useState<0 | 1>(0);
  const tx = useTx();
  const { data: mine } = useReadContract({ address: ADDR.registry, abi: registryAbi, functionName: "circuitsOf", args: address ? [address] : undefined, query: { enabled: !!address } });
  const { data: allowance, refetch } = useReadContract({ address: ADDR.usdc, abi: erc20Abi, functionName: "allowance", args: address ? [address, ADDR.arena] : undefined, query: { enabled: !!address && asset === 1 } });
  const { data: rec } = useReadContract({ address: ADDR.arena, abi: arenaAbi, functionName: "record", args: address ? [address] : undefined, query: { enabled: !!address } });
  useEffect(() => {
    if (tx.receipt?.status === "success") refetch();
  }, [tx.receipt, refetch]);

  if (!address)
    return (
      <div className="col gap-16">
        <p className="ink3" style={{ fontSize: 14, margin: 0 }}>
          Connect a wallet to take a seat. Agentic Wallet users play through the GateWars skill (see FOR AGENTS).
        </p>
        <RiskBanner />
      </div>
    );
  if (hasAgentId === false) return <p className="c-defect">This wallet has no SPACE ID Agent ID. Every GateWars action requires one.</p>;
  const locked = (tier === 1 && (rec?.rookieWins ?? 0) < 1) || (tier === 2 && (rec?.proWins ?? 0) < 3);
  if (rec && locked) return <p className="ink3">{tier === 1 ? "PRO unlocks after 1 Rookie win." : "CHAMPION unlocks after 3 Pro wins."}</p>;

  const value = q ? (q.bnbWei * 101n) / 100n : 0n;
  const needApprove = asset === 1 && q !== undefined && (allowance ?? 0n) < q.usdc;
  const go = async () => {
    if (!q) return;
    if (needApprove) {
      await tx.send({ address: ADDR.usdc, abi: erc20Abi, functionName: "approve", args: [ADDR.arena, q.usdc] }); // exact amount only
      return;
    }
    const v = asset === 0 ? value : 0n;
    const cid = BigInt(circuit);
    if (mode === "enter") await tx.send({ address: ADDR.arena, abi: arenaAbi, functionName: "enter", args: [tier, cid, asset], value: v });
    else if (mode === "create") await tx.send({ address: ADDR.arena, abi: arenaAbi, functionName: "createChallenge", args: [cid, asset], value: v });
    else await tx.send({ address: ADDR.arena, abi: arenaAbi, functionName: "acceptChallenge", args: [challengeId!, cid, asset], value: v });
    onDone?.();
  };

  return (
    <div className="col gap-16">
      <div className="col gap-8">
        <span className="label">PAY WITH</span>
        <div className="seg" role="group" aria-label="Payment asset">
          <button aria-pressed={asset === 0} onClick={() => setAsset(0)}>
            BNB
          </button>
          <button aria-pressed={asset === 1} onClick={() => setAsset(1)}>
            USDC
          </button>
        </div>
      </div>
      <label className="col gap-8">
        <span className="label">CIRCUIT</span>
        <select value={circuit} onChange={(e) => setCircuit(e.target.value)}>
          {[1, 2, 3].map((id) => (
            <option key={id} value={id}>
              #{id} {STARTER_NAMES[id]} (STARTER)
            </option>
          ))}
          {(mine ?? []).map((id) => (
            <option key={String(id)} value={String(id)}>
              #{String(id)} (MINE)
            </option>
          ))}
        </select>
      </label>
      <div className="panel-2 pad-sm mono" style={{ fontSize: 13 }}>
        {!q ? (
          <Skel w={180} />
        ) : asset === 0 ? (
          <>
            ≈ {fmtUsd8(q.usd)} ({fmtBnb(q.bnbWei, 4)}), excess refunded
            <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
              SENDS {fmtBnb(value, 6)} · THE CONTRACT KEEPS ONLY THE QUOTE
            </div>
          </>
        ) : (
          <>
            Exactly {fmtUsdc(q.usdc)}
            <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
              {needApprove ? "STEP 1: APPROVE EXACTLY THIS AMOUNT · STEP 2: ENTER" : "APPROVED · READY"}
            </div>
          </>
        )}
      </div>
      <RiskBanner />
      <button className="btn lg block" disabled={!q || tx.busy} onClick={() => go().catch(() => {})}>
        {needApprove ? `APPROVE ${q ? fmtUsdc(q.usdc) : ""}` : mode === "enter" ? `CONFIRM · ENTER ${TIERS[tier]}` : mode === "create" ? "CONFIRM · CREATE CHALLENGE" : "CONFIRM · ACCEPT CHALLENGE"}
      </button>
      {tx.status}
    </div>
  );
}

export default function EntrySheet({ open, onClose, tier, mode = "enter", challengeId, title }: { open: boolean; onClose: () => void; tier: number; mode?: Mode; challengeId?: bigint; title?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    document.body.classList.add("scroll-lock");
    requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>("button")?.focus());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const f = Array.from(ref.current?.querySelectorAll<HTMLElement>("button:not([disabled]), select, a[href]") ?? []);
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
  return (
    <>
      <div className="backdrop" onClick={onClose} aria-hidden />
      <div className="sheet-bottom" role="dialog" aria-modal="true" aria-label={title ?? `Enter ${TIERS[tier]}`} ref={ref}>
        <div className="row between" style={{ marginBottom: 12 }}>
          <span className="label lg" style={{ color: "var(--ink)" }}>
            {title ?? `ENTER ${TIERS[tier]}`}
          </span>
          <button className="btn ghost icon" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        <EntryForm tier={tier} mode={mode} challengeId={challengeId} onDone={onClose} />
      </div>
    </>
  );
}
