"use client";
import { useEffect, useState } from "react";
import { formatEther, formatUnits } from "viem";
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { ADDR, agentIdAbi, bscscanTx, RISK, STATES } from "@/lib/contracts";

export const fmtBnb = (x: bigint, d = 5) => `${Number(formatEther(x)).toFixed(d)} BNB`;
export const fmtUsdc = (x: bigint) => `${Number(formatUnits(x, 18)).toFixed(2)} USDC`;
export const fmtUsd8 = (x: bigint) => `$${(Number(x) / 1e8).toFixed(2)}`;

export const TIER_KEY = ["rookie", "pro", "champion"] as const;
export const TIER_COLOR = ["var(--rookie)", "var(--pro)", "var(--champ)"];

export function RiskBanner() {
  return (
    <div className="risk">
      <span>⚠</span>
      <span>{RISK}</span>
    </div>
  );
}

export function StatePill({ state }: { state: number }) {
  const s = STATES[state] ?? "NONE";
  return (
    <span className={`pill ${s.toLowerCase()} ${s === "OPEN" ? "live" : ""}`}>
      <span className="dot" />
      {s}
    </span>
  );
}

/** Deterministic gradient avatar from an address (no external images). */
export function Avatar({ addr, size = 34, label }: { addr: string; size?: number; label?: string }) {
  const h = parseInt(addr.slice(2, 8), 16);
  const a = h % 360;
  const b = (a + 70 + ((h >> 8) % 90)) % 360;
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, borderRadius: size * 0.3, fontSize: size * 0.36, background: `linear-gradient(135deg, hsl(${a} 95% 62%), hsl(${b} 90% 55%))` }}
    >
      {label ?? ""}
    </span>
  );
}

export function TierIcon({ tier, size = 26 }: { tier: number; size?: number }) {
  const c = ["#2dffb3", "#39d0ff", "#ffc94d"][tier];
  if (tier === 0)
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round">
        <path d="M4 12h5l3-6 3 12 3-6h2" />
      </svg>
    );
  if (tier === 1)
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinejoin="round">
        <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
        <path d="M12 8v8M8 10l4-2 4 2" />
      </svg>
    );
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinejoin="round">
      <path d="M3 8l4 4 5-7 5 7 4-4-2 11H5z" />
    </svg>
  );
}

export function useCountdown(ts: number) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  const left = ts - now;
  if (!ts) return "";
  if (left <= 0) return "expired";
  const h = Math.floor(left / 3600);
  const m = Math.floor((left % 3600) / 60);
  const s = left % 60;
  return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
}

export function useAgent() {
  const { address } = useAccount();
  const { data } = useReadContract({ address: ADDR.agentId, abi: agentIdAbi, functionName: "balanceOf", args: address ? [address] : undefined, query: { enabled: !!address } });
  return { address, hasAgentId: data !== undefined ? data > 0n : undefined };
}

/** A write with its receipt status rendered inline. Every tx goes through the user's own wallet confirmation. */
export function useTx() {
  const { writeContractAsync, isPending, error, reset } = useWriteContract();
  const [hash, setHash] = useState<`0x${string}`>();
  const rc = useWaitForTransactionReceipt({ hash });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const send = async (args: any) => {
    reset();
    const h = await writeContractAsync(args);
    setHash(h);
    return h;
  };
  const status = (
    <div style={{ fontSize: 12, marginTop: 8 }} className="mono">
      {isPending && <span className="muted">◌ confirm in your wallet…</span>}
      {hash && (
        <span>
          <a href={bscscanTx(hash)} target="_blank" rel="noreferrer">
            view tx ↗
          </a>{" "}
          {rc.isLoading ? <span className="muted">pending…</span> : rc.data?.status === "success" ? <span className="ok">✓ confirmed</span> : rc.data ? <span className="err">✗ failed</span> : ""}
        </span>
      )}
      {error && <span className="err">{(error as { shortMessage?: string }).shortMessage ?? error.message}</span>}
    </div>
  );
  return { send, status, receipt: rc.data, busy: isPending || rc.isLoading };
}
