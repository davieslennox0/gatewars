"use client";
import { useState } from "react";
import { useReadContract } from "wagmi";
import { ADDR, arenaAbi, erc20Abi, registryAbi, STARTERS, TIERS } from "@/lib/contracts";
import { useQuotes } from "@/lib/data";
import { fmtBnb, fmtUsd8, fmtUsdc, RiskBanner, useAgent, useTx } from "./ui";

/** Entry for ROOKIE / PRO brackets (tier 0/1) or Champion create/accept (tier 2 with mode). */
export default function EnterPanel({ tier, mode = "enter", challengeId }: { tier: number; mode?: "enter" | "create" | "accept"; challengeId?: bigint }) {
  const { address, hasAgentId } = useAgent();
  const { data: quotes } = useQuotes();
  const q = quotes?.[tier];
  const [circuit, setCircuit] = useState("1");
  const [asset, setAsset] = useState<0 | 1>(0);
  const [ack, setAck] = useState(false);
  const tx = useTx();
  const { data: mine } = useReadContract({ address: ADDR.registry, abi: registryAbi, functionName: "circuitsOf", args: address ? [address] : undefined, query: { enabled: !!address } });
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: ADDR.usdc,
    abi: erc20Abi,
    functionName: "allowance",
    args: address ? [address, ADDR.arena] : undefined,
    query: { enabled: !!address && asset === 1 },
  });
  const { data: rec } = useReadContract({ address: ADDR.arena, abi: arenaAbi, functionName: "record", args: address ? [address] : undefined, query: { enabled: !!address } });

  if (!address) return <p className="muted">Connect a wallet to enter. Agentic Wallet users: use the GateWars skill (see Agents).</p>;
  if (hasAgentId === false) return <p className="err">This wallet has no SPACE ID Agent ID. Every GateWars action requires one.</p>;
  const locked = (tier === 1 && (rec?.rookieWins ?? 0) < 1) || (tier === 2 && (rec?.proWins ?? 0) < 3);
  if (rec && locked) return <p className="muted">{tier === 1 ? "PRO unlocks after 1 Rookie win." : "CHAMPION unlocks after 3 Pro wins."}</p>;
  if (!q) return <p className="muted">loading quote…</p>;

  const value = (q.bnbWei * 101n) / 100n;
  const needApprove = asset === 1 && (allowance ?? 0n) < q.usdc;
  const cid = BigInt(circuit);
  const go = async () => {
    if (asset === 1 && needApprove) {
      // exact entry amount only, never unlimited
      await tx.send({ address: ADDR.usdc, abi: erc20Abi, functionName: "approve", args: [ADDR.arena, q.usdc] });
      setTimeout(() => refetchAllowance(), 4000);
      return;
    }
    const v = asset === 0 ? value : 0n;
    if (mode === "enter") await tx.send({ address: ADDR.arena, abi: arenaAbi, functionName: "enter", args: [tier, cid, asset], value: v });
    else if (mode === "create") await tx.send({ address: ADDR.arena, abi: arenaAbi, functionName: "createChallenge", args: [cid, asset], value: v });
    else await tx.send({ address: ADDR.arena, abi: arenaAbi, functionName: "acceptChallenge", args: [challengeId!, cid, asset], value: v });
  };

  return (
    <div>
      <RiskBanner />
      <div className="row">
        <label>
          circuit{" "}
          <select value={circuit} onChange={(e) => setCircuit(e.target.value)}>
            {Object.entries(STARTERS).map(([id, n]) => (
              <option key={id} value={id}>
                #{id} {n} (starter)
              </option>
            ))}
            {(mine ?? []).map((id) => (
              <option key={String(id)} value={String(id)}>
                #{String(id)} mine
              </option>
            ))}
          </select>
        </label>
        <label>
          pay with{" "}
          <select value={asset} onChange={(e) => setAsset(Number(e.target.value) as 0 | 1)}>
            <option value={0}>BNB</option>
            <option value={1}>USDC</option>
          </select>
        </label>
      </div>
      <p>
        {asset === 0 ? (
          <>
            ≈ {fmtUsd8(q.usd)} ({fmtBnb(q.bnbWei, 6)}), you send {fmtBnb(value, 6)} — <b>excess refunded</b> in the same transaction.
          </>
        ) : (
          <>
            Exactly {fmtUsdc(q.usdc)}. {needApprove ? "Step 1: approve exactly this amount (never unlimited). Step 2: enter." : "Approved — ready to enter."}
          </>
        )}
      </p>
      <label className="row" style={{ fontSize: 13 }}>
        <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> I understand entry fees can be lost.
      </label>
      <div style={{ marginTop: 8 }}>
        <button disabled={!ack || tx.busy} onClick={() => go().catch(() => {})}>
          {asset === 1 && needApprove ? `Approve ${fmtUsdc(q.usdc)}` : mode === "enter" ? `Enter ${TIERS[tier]}` : mode === "create" ? "Create challenge" : "Accept challenge"}
        </button>
        {tx.status}
      </div>
    </div>
  );
}
