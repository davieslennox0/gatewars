"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { isAddress, type Address } from "viem";
import { ADDR, arenaAbi, registryAbi, TIERS } from "@/lib/contracts";
import { useRead } from "@/lib/client";
import { useAllGames, useTables } from "@/lib/data";
import { useL } from "@/lib/i18n";
import { AgentIdChip } from "@/components/Lobby";
import { LedTable } from "@/components/Chips";
import { AgentCommand, fmtBnb, fmtUsdc, StateLabel, TIER_ZH } from "@/components/ui";

/** Read-only Agent ID profile by ADDRESS (address -> handle only; there is no name -> wallet lookup). */
export default function Profile() {
  const L = useL();
  const [input, setInput] = useState("");
  const [addr, setAddr] = useState<Address | null>(null);
  useEffect(() => {
    const a = new URLSearchParams(window.location.search).get("a");
    if (a && isAddress(a)) {
      setAddr(a);
      setInput(a);
    }
  }, []);
  const go = () => {
    if (isAddress(input.trim())) {
      const a = input.trim() as Address;
      setAddr(a);
      window.history.replaceState(null, "", `/me?a=${a}`);
    }
  };
  return (
    <>
      <section style={{ padding: "32px 0 8px" }}>
        <span className="label">{L("智能体档案 · AGENT ID", "AGENT PROFILE · AGENT ID")}</span>
        <h1 style={{ marginTop: 10 }}>{L("查看智能体档案", "Agent profile")}</h1>
        <p className="ink3" style={{ maxWidth: 720 }}>
          {L("输入智能体钱包地址（0x…）。名称只用于展示，本站不提供按名称查钱包。", "Enter an agent wallet address (0x…). Names are display-only; this site never looks up a wallet by name.")}
        </p>
        <div className="row" style={{ flexWrap: "nowrap", maxWidth: 640 }}>
          <input type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()} placeholder="0x…" aria-label={L("钱包地址", "Wallet address")} style={{ flex: 1, minHeight: 44, minWidth: 0 }} />
          <button className="btn" onClick={go} disabled={!isAddress(input.trim())}>
            {L("查看", "VIEW")}
          </button>
        </div>
      </section>
      {addr && <ProfileBody addr={addr} />}
    </>
  );
}

function ProfileBody({ addr }: { addr: Address }) {
  const L = useL();
  const { data: cb } = useRead<bigint>({ address: ADDR.arena, abi: arenaAbi, functionName: "claimableBnb", args: [addr] });
  const { data: cu } = useRead<bigint>({ address: ADDR.arena, abi: arenaAbi, functionName: "claimableUsdc", args: [addr] });
  const { data: mine } = useRead<readonly bigint[]>({ address: ADDR.registry, abi: registryAbi, functionName: "circuitsOf", args: [addr] });
  const { data: tables } = useTables(mine);
  const { data: games } = useAllGames();
  const myGames = (games ?? []).filter((g) => g.players.some((p) => p.toLowerCase() === addr.toLowerCase())).reverse();
  const has = (cb ?? 0n) > 0n || (cu ?? 0n) > 0n;
  return (
    <>
      <div style={{ marginTop: 16 }}>
        <AgentIdChip address={addr} />
      </div>
      <section className="section panel pad col gap-8">
        <span className="label">{L("可领取", "CLAIMABLE")}</span>
        <span className="mono" style={{ fontSize: 18, fontWeight: 700 }}>
          {fmtBnb(cb ?? 0n, 5)} + {fmtUsdc(cu ?? 0n)}
        </span>
        {has && <AgentCommand cmd="gatewars claim" />}
      </section>
      <section className="section">
        <div className="section-head">
          <h2>{L("电路", "Circuits")}</h2>
          <Link href="/builder">{L("设计一个 →", "BUILD ONE →")}</Link>
        </div>
        {!mine?.length ? (
          <div className="panel pad ink3">{L("还没有电路。入门电路 #1–#3 任何人都可使用。", "No circuits yet. Starters #1–#3 are free for anyone to enter with.")}</div>
        ) : (
          <div className="grid-3">
            {mine.map((id) => (
              <div key={String(id)} className="panel pad col gap-8">
                <span className="label">
                  {L("电路", "CIRCUIT")} #{String(id)}
                </span>
                {tables?.[String(id)] !== undefined && <LedTable table={tables[String(id)]} />}
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="section">
        <h2 style={{ marginBottom: 12 }}>{L("参赛牌桌", "Tables")}</h2>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>{L("牌桌", "TABLE")}</th>
                <th>{L("级别", "TIER")}</th>
                <th>{L("状态", "STATE")}</th>
                <th>{L("席位", "SEATS")}</th>
              </tr>
            </thead>
            <tbody>
              {myGames.map((g) => (
                <tr key={String(g.id)}>
                  <td>
                    <Link href={`/arena/${g.id}`}>#{String(g.id)}</Link>
                  </td>
                  <td>{L(TIER_ZH[g.tier], TIERS[g.tier])}</td>
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
                    {L("暂无。", "None yet.")}
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
