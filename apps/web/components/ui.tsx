"use client";
import { useEffect, useState } from "react";
import { formatEther, formatUnits } from "viem";
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { ADDR, agentIdAbi, bscscanTx, RISK, STATES } from "@/lib/contracts";

export const fmtBnb = (x: bigint, d = 4) => `${Number(formatEther(x)).toFixed(d)} BNB`;
export const fmtUsdc = (x: bigint) => `${Number(formatUnits(x, 18)).toFixed(2)} USDC`;
export const fmtUsd8 = (x: bigint) => `$${(Number(x) / 1e8).toFixed(2)}`;
export const TIER_PART = ["GW-R8", "GW-P4", "GW-C2"];

export function Skel({ w = 52 }: { w?: number }) {
  return <span className="skel" style={{ width: w }} aria-label="loading" />;
}

export function RiskBanner() {
  return (
    <div className="risk" role="note">
      <span className="tag">RISK</span>
      <span>{RISK}</span>
    </div>
  );
}

export function StateLabel({ state }: { state: number }) {
  const s = STATES[state] ?? "NONE";
  const color = s === "OPEN" ? "var(--coop)" : s === "EXPIRED" ? "var(--defect)" : "var(--ink-3)";
  return (
    <span className="label" style={{ color }}>
      {s === "OPEN" && <span className="live-dot" style={{ marginRight: 6 }} />}
      {s}
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

export function fmtLeft(ts: number, now: number) {
  if (!ts) return "—";
  const left = ts - now;
  if (left <= 0) return "EXPIRED";
  const h = Math.floor(left / 3600);
  const m = Math.floor((left % 3600) / 60);
  return `${String(h).padStart(2, "0")}H ${String(m).padStart(2, "0")}M`;
}

export function ago(ts: number, now: number) {
  const d = Math.max(0, now - ts);
  if (d < 60) return `${d}S AGO`;
  if (d < 3600) return `${Math.floor(d / 60)}M AGO`;
  if (d < 86400) return `${Math.floor(d / 3600)}H AGO`;
  return `${Math.floor(d / 86400)}D AGO`;
}

export function useAgent() {
  const { address } = useAccount();
  const { data } = useReadContract({ address: ADDR.agentId, abi: agentIdAbi, functionName: "balanceOf", args: address ? [address] : undefined, query: { enabled: !!address } });
  const { data: handle } = useReadContract({ address: ADDR.agentId, abi: agentIdAbi, functionName: "handleOf", args: address ? [address] : undefined, query: { enabled: !!address } });
  return { address, hasAgentId: data !== undefined ? data > 0n : undefined, handle: (handle as string | undefined) || undefined };
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
    <div className="mono" style={{ fontSize: 12, marginTop: 8 }} aria-live="polite">
      {isPending && <span className="muted">CONFIRM IN YOUR WALLET…</span>}
      {hash && (
        <span>
          <a href={bscscanTx(hash)} target="_blank" rel="noreferrer">
            VIEW TX ↗
          </a>{" "}
          {rc.isLoading ? <span className="muted">PENDING…</span> : rc.data?.status === "success" ? <span className="c-coop">CONFIRMED</span> : rc.data ? <span className="c-defect">FAILED</span> : ""}
        </span>
      )}
      {error && <span className="c-defect">{(error as { shortMessage?: string }).shortMessage ?? error.message}</span>}
    </div>
  );
  return { send, status, receipt: rc.data, busy: isPending || rc.isLoading };
}
