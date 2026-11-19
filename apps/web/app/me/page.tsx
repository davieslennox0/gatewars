"use client";
import Link from "next/link";
import { useReadContract } from "wagmi";
import { ADDR, arenaAbi, registryAbi, TIERS } from "@/lib/contracts";
import { useAllGames, useTables } from "@/lib/data";
import { AgentIdChip } from "@/components/Lobby";
import { LedTable } from "@/components/Chips";
import { fmtBnb, fmtUsdc, StateLabel, useAgent, useTx } from "@/components/ui";

export default function Me() {
  const { address, handle, hasAgentId } = useAgent();
  const tx = useTx();
  const { data: cb } = useReadContract({ address: ADDR.arena, abi: arenaAbi, functionName: "claimableBnb", args: address ? [address] : undefined, query: { enabled: !!address } });
  const { data: cu } = useReadContract({ address: ADDR.arena, abi: arenaAbi, functionName: "claimableUsdc", args: address ? [address] : undefined, query: { enabled: !!address } });
  const { data: mine } = useReadContract({ address: ADDR.registry, abi: registryAbi, functionName: "circuitsOf", args: address ? [address] : undefined, query: { enabled: !!address } });
  const { data: tables } = useTables(mine);
  const { data: games } = useAllGames();
  if (!address)
    return (
      <section style={{ padding: "40px 0" }}>
        <span className="label">PROFILE</span>
        <h1 style={{ marginTop: 10 }}>Connect a wallet.</h1>
        <p className="ink3">Your Agent ID, record, circuits and claimable prizes appear here.</p>
      </section>
    );
  const myGames = (games ?? []).filter((g) => g.players.some((p) => p.toLowerCase() === address.toLowerCase())).reverse();
  const has = (cb ?? 0n) > 0n || (cu ?? 0n) > 0n;
  return (
    <>
      <section style={{ padding: "32px 0 8px" }}>
        <span className="label">PROFILE · AGENT ID</span>
      </section>
      {hasAgentId === false && <p className="c-defect">This wallet holds no SPACE ID Agent ID.</p>}
      <AgentIdChip address={address} handle={handle} />
      <section className="section panel pad col gap-8">
        <span className="label">CLAIMABLE</span>
        <div className="row between">
          <span className="mono" style={{ fontSize: 18, fontWeight: 700 }}>
            {fmtBnb(cb ?? 0n, 5)} + {fmtUsdc(cu ?? 0n)}
          </span>
          <button className="btn lg" disabled={!has || tx.busy} onClick={() => tx.send({ address: ADDR.arena, abi: arenaAbi, functionName: "claim" }).catch(() => {})}>
            CLAIM
          </button>
        </div>
        {tx.status}
      </section>
      <section className="section">
        <div className="section-head">
          <h2>My circuits</h2>
          <Link href="/builder">BUILD ONE →</Link>
        </div>
        {!mine?.length ? (
          <div className="panel pad ink3">No circuits yet. Starters #1–#3 are free for anyone to enter with.</div>
        ) : (
          <div className="grid-3">
            {mine.map((id) => (
              <div key={String(id)} className="panel pad col gap-8">
                <span className="label">CIRCUIT #{String(id)}</span>
                {tables?.[String(id)] !== undefined && <LedTable table={tables[String(id)]} />}
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="section">
        <h2 style={{ marginBottom: 12 }}>My tables</h2>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>TABLE</th>
                <th>TIER</th>
                <th>STATE</th>
                <th>SEATS</th>
              </tr>
            </thead>
            <tbody>
              {myGames.map((g) => (
                <tr key={String(g.id)}>
                  <td>
                    <Link href={`/arena/${g.id}`}>#{String(g.id)}</Link>
                  </td>
                  <td>{TIERS[g.tier]}</td>
                  <td>
                    <StateLabel state={g.state} />
                  </td>
                  <td>
                    {g.players.length}/{g.size}
                  </td>
                </tr>
              ))}
              {!myGames.length && (
                <tr>
                  <td colSpan={4} className="ink3">
                    No tables yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
