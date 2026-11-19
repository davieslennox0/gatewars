"use client";
import { useEffect, useState } from "react";
import { formatEther, formatUnits } from "viem";
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { ADDR, agentIdAbi, bscscanTx, RISK, STATES } from "@/lib/contracts";

export const fmtBnb = (x: bigint, d = 5) => `${Number(formatEther(x)).toFixed(d)} BNB`;
export const fmtUsdc = (x: bigint) => `${Number(formatUnits(x, 18)).toFixed(2)} USDC`;
export const fmtUsd8 = (x: bigint) => `$${(Number(x) / 1e8).toFixed(2)}`;

export function RiskBanner() {
  return <div className="risk">⚠ {RISK}</div>;
}

export function StatePill({ state }: { state: number }) {
  const s = STATES[state] ?? "NONE";
  return <span className={`pill ${s.toLowerCase()}`}>{s}</span>;
}

export function useCountdown(ts: number) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  const left = ts - now;
  if (left <= 0) return "expired";
  const h = Math.floor(left / 3600);
  const m = Math.floor((left % 3600) / 60);
  return `${h}h ${m}m left`;
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
    <div style={{ fontSize: 12, marginTop: 6 }}>
      {isPending && <span className="muted">confirm in your wallet…</span>}
      {hash && (
        <span>
          <a href={bscscanTx(hash)} target="_blank" rel="noreferrer">
            tx
          </a>{" "}
          {rc.isLoading ? "pending…" : rc.data?.status === "success" ? <span className="ok">confirmed</span> : rc.data ? <span className="err">failed</span> : ""}
        </span>
      )}
      {error && <span className="err">{(error as { shortMessage?: string }).shortMessage ?? error.message}</span>}
    </div>
  );
  return { send, status, receipt: rc.data, busy: isPending || rc.isLoading };
}
