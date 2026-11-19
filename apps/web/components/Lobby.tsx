"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ADDR, agentIdAbi, arenaAbi, displayName, TIERS, type GameView } from "@/lib/contracts";
import { useRead } from "@/lib/client";
import { useAllGames, useGame, useQuotes } from "@/lib/data";
import { useL } from "@/lib/i18n";
import { ChipSeat, PoolValue } from "./Chips";
import EntrySheet from "./EntrySheet";
import { fmtUsd8, Skel, TIER_ZH, useLeft, useNow } from "./ui";

const MATCHES = ["28", "6", "1"];

type Rec = { matchesPlayed: number; wins: number; losses: number; draws: number; rookieWins: number; proWins: number; championWins: number; gamesEntered: number };

export function AgentIdChip({ address }: { address: `0x${string}` }) {
  const L = useL();
  const { data: r } = useRead<Rec>({ address: ADDR.arena, abi: arenaAbi, functionName: "record", args: [address] });
  const { data: handle } = useRead<string>({ address: ADDR.agentId, abi: agentIdAbi, functionName: "handleOf", args: [address] });
  const { data: bal } = useRead<bigint>({ address: ADDR.agentId, abi: agentIdAbi, functionName: "balanceOf", args: [address] });
  const lvl = r ? (r.proWins >= 3 ? 2 : r.rookieWins >= 1 ? 1 : 0) : 0;
  const tier = (i: number) => L(TIER_ZH[i], TIERS[i]);
  return (
    <div className="idchip">
      <div className="pins-v" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="pin" />
        ))}
      </div>
      <div className="body">
        <div className="row between">
          <span className="label sm">SPACE ID AGENT ID</span>
          <span className="label sm">{L("ERC-721 · 不可转让", "ERC-721 · NON-TRANSFERABLE")}</span>
        </div>
        <div className="handle" style={{ marginTop: 10 }}>
          {handle ? `${handle}.ai` : bal === 0n ? L("无 Agent ID", "no Agent ID") : <Skel w={140} />}
        </div>
        <div className="mono muted" style={{ fontSize: 12 }}>
          {address.slice(0, 6)}…{address.slice(-4)}
        </div>
        <div className="stats4">
          {[
            [L("胜", "WINS"), r?.wins],
            [L("负", "LOSSES"), r?.losses],
            [L("对局", "MATCHES"), r?.matchesPlayed],
            [L("参赛桌", "TABLES"), r?.gamesEntered],
          ].map(([k, v]) => (
            <div key={k as string}>
              <div className="label sm">{k}</div>
              <div className="v">{v === undefined ? <Skel w={20} /> : String(v)}</div>
            </div>
          ))}
        </div>
        <div className="ladder" role="img" aria-label={L(`段位：已解锁至${TIER_ZH[lvl]}`, `Tier ladder, unlocked up to ${TIERS[lvl]}`)}>
          <span className="t lit">{tier(0)}</span>
          <span className="node lit" />
          <span className={`trace ${lvl >= 1 ? "lit" : ""}`} />
          <span className={`node ${lvl >= 1 ? "lit" : ""}`} />
          <span className={`t ${lvl >= 1 ? "lit" : ""}`}>{tier(1)}</span>
          <span className={`trace ${lvl >= 2 ? "lit" : ""}`} />
          <span className={`node ${lvl >= 2 ? "lit" : ""}`} />
          <span className={`t ${lvl >= 2 ? "lit" : ""}`}>{tier(2)}</span>
        </div>
      </div>
      <div className="pins-v" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="pin" />
        ))}
      </div>
    </div>
  );
}

export function TierCard({ tier }: { tier: 0 | 1 | 2 }) {
  const L = useL();
  const left = useLeft();
  const { data: openId } = useRead<bigint>({ address: ADDR.arena, abi: arenaAbi, functionName: "openBracket", args: [tier === 2 ? 0 : tier], enabled: tier !== 2, refetchInterval: 15_000 });
  const { data: chIds } = useRead<readonly bigint[]>({ address: ADDR.arena, abi: arenaAbi, functionName: "openChallenges", enabled: tier === 2, refetchInterval: 20_000 });
  const gid = tier === 2 ? chIds?.[0] : openId && openId > 0n ? openId : undefined;
  const { data: g } = useGame(gid);
  const { data: q } = useQuotes();
  const now = useNow(30_000);
  const [sheet, setSheet] = useState(false);
  const price = q ? fmtUsd8(q[tier].usd) : undefined;
  const loading = tier !== 2 ? openId === undefined : chIds === undefined;
  const req = [L("任何 Agent ID 均可参加", "OPEN TO ANY AGENT ID"), L("资格：1 次新手赛冠军", "QUALIFY: 1 ROOKIE WIN"), L("资格：3 次专业赛冠军", "QUALIFY: 3 PRO WINS")][tier];

  return (
    <div className={`tier ${tier > 0 ? "locked" : ""}`}>
      <div className="row between">
        <span className="label">
          {L(`第 ${tier + 1} 级`, `TIER 0${tier + 1}`)} · {tier === 0 ? L("开放", "OPEN") : L("需资格", "QUALIFIED")}
        </span>
        <span className="label">{tier === 2 ? "1V1" : L(`${tier === 0 ? 8 : 4} 个席位`, `${tier === 0 ? 8 : 4} SEATS`)}</span>
      </div>
      <div className="row between" style={{ alignItems: "baseline" }}>
        <span className="name">{L(`${TIER_ZH[tier]}赛`, TIERS[tier])}</span>
        <span className="price">{price ?? <Skel w={56} />}</span>
      </div>
      <ChipSeat tier={tier} game={g} onTake={() => setSheet(true)} />
      <dl className="dl">
        <div>
          <dt>{L("奖池", "POOL")}</dt>
          <dd>{loading ? <Skel w={44} /> : g ? fmtUsd8(g.poolUsd) : "$0.00"}</dd>
        </div>
        <div>
          <dt>{L("对局数", "MATCHES")}</dt>
          <dd>{MATCHES[tier]}</dd>
        </div>
        <div>
          <dt>{L("截止", "CLOSES")}</dt>
          <dd>{g ? left(Number(g.expiresAt), now) : "—"}</dd>
        </div>
      </dl>
      {g && <PoolValue g={g} />}
      <div className="col gap-4">
        <span className="label sm">{req}</span>
        <div className="progress" aria-hidden>
          <i style={{ width: tier === 0 ? "100%" : "0%" }} />
        </div>
      </div>
      {tier === 2 ? (
        <Link href="/challenges" className="btn lg block">
          {L("冠军挑战", "CHAMPION CHALLENGES")}
        </Link>
      ) : (
        <button className="btn lg block" onClick={() => setSheet(true)}>
          {L(`入座 · ${price ?? ""}`, `TAKE A SEAT · ${price ?? ""}`)}
        </button>
      )}
      <EntrySheet open={sheet} onClose={() => setSheet(false)} tier={tier} />
    </div>
  );
}

type Filter = "ALL" | "ROOKIE" | "PRO" | "CHALLENGES";

function SeatBar({ g }: { g: GameView }) {
  const L = useL();
  return (
    <span className="seatbar" role="img" aria-label={L(`${g.players.length}/${g.size} 席已坐`, `${g.players.length} of ${g.size} seats`)}>
      {Array.from({ length: g.size }, (_, i) => (
        <i key={i} className={i < g.players.length ? "on" : ""} />
      ))}
    </span>
  );
}

export function TablesTable() {
  const L = useL();
  const left = useLeft();
  const { data: games, isLoading } = useAllGames();
  const { data: q } = useQuotes();
  const [f, setF] = useState<Filter>("ALL");
  const [sheet, setSheet] = useState<{ tier: number; mode: "enter" | "accept"; id?: bigint } | null>(null);
  const now = useNow(30_000);
  const rows = useMemo(
    () =>
      (games ?? [])
        .filter((g) => g.state === 1 || g.state === 2)
        .filter((g) => (f === "ALL" ? true : f === "ROOKIE" ? g.tier === 0 : f === "PRO" ? g.tier === 1 : g.tier === 2))
        .sort((a, b) => Number(b.id - a.id)),
    [games, f],
  );
  const FL: Record<Filter, string> = { ALL: L("全部", "ALL"), ROOKIE: L("新手", "ROOKIE"), PRO: L("专业", "PRO"), CHALLENGES: L("挑战", "CHALLENGES") };
  const buyIn = (t: number) => (q ? fmtUsd8(q[t].usd) : "…");
  const seated = (g: GameView) => g.players.map((p, i) => displayName(g.handles[i], p)).join(", ");
  const tierName = (t: number) => L(TIER_ZH[t], TIERS[t]);
  const act = (g: GameView) =>
    g.state === 1 ? (
      <button className="btn coop" style={{ minHeight: 36 }} onClick={() => setSheet({ tier: g.tier, mode: g.tier === 2 ? "accept" : "enter", id: g.id })}>
        {L("入座", "SIT")} · {buyIn(g.tier)}
      </button>
    ) : (
      <Link href={`/arena/${g.id}`} className="btn outline" style={{ minHeight: 36 }}>
        {L("查看", "VIEW")}
      </Link>
    );
  return (
    <div>
      <div className="section-head">
        <div>
          <span className="label">{L("牌桌", "TABLES")}</span>
          <h2>{L("开放中的牌桌", "Open tables")}</h2>
        </div>
        <div className="chips-filter" role="group" aria-label={L("筛选牌桌", "Filter tables")}>
          {(["ALL", "ROOKIE", "PRO", "CHALLENGES"] as Filter[]).map((x) => (
            <button key={x} className="chip-f" aria-pressed={f === x} onClick={() => setF(x)}>
              {FL[x]}
            </button>
          ))}
        </div>
      </div>
      {isLoading ? (
        <div className="panel pad">
          <Skel w={240} />
        </div>
      ) : !rows.length ? (
        <div className="panel pad ink3" style={{ fontSize: 14 }}>
          {L("暂无开放牌桌。第一位报名者会开启新的一桌。", "No open tables right now. The first entry opens a new one.")}
        </div>
      ) : (
        <>
          <div className="tbl-wrap desk-only">
            <table className="tbl">
              <thead>
                <tr>
                  <th>{L("牌桌", "TABLE")}</th>
                  <th>{L("级别", "TIER")}</th>
                  <th>{L("报名费", "BUY-IN")}</th>
                  <th>{L("席位", "SEATS")}</th>
                  <th>{L("奖池", "POOL")}</th>
                  <th>{L("已入座", "SEATED")}</th>
                  <th>{L("截止", "CLOSES")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((g) => (
                  <tr key={String(g.id)}>
                    <td>
                      <Link href={`/arena/${g.id}`}>#{String(g.id)}</Link>
                    </td>
                    <td>{tierName(g.tier)}</td>
                    <td>{buyIn(g.tier)}</td>
                    <td>
                      <SeatBar g={g} /> <span className="muted">{g.players.length}/{g.size}</span>
                    </td>
                    <td>{fmtUsd8(g.poolUsd)}</td>
                    <td style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis" }}>{seated(g)}</td>
                    <td>{g.state === 2 ? L("已满 · 待结算", "FULL · SETTLE") : left(Number(g.expiresAt), now)}</td>
                    <td style={{ textAlign: "right" }}>{act(g)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="cards-mob mob-only">
            {rows.map((g) => (
              <div key={String(g.id)} className="panel pad-sm col gap-8">
                <div className="row between">
                  <Link href={`/arena/${g.id}`} className="mono" style={{ fontWeight: 700 }}>
                    #{String(g.id)} · {tierName(g.tier)}
                  </Link>
                  <span className="mono" style={{ fontWeight: 600 }}>
                    {buyIn(g.tier)}
                  </span>
                </div>
                <div className="row between">
                  <SeatBar g={g} />
                  <span className="mono muted" style={{ fontSize: 12 }}>
                    {L("奖池", "POOL")} {fmtUsd8(g.poolUsd)} · {g.state === 2 ? L("已满", "FULL") : left(Number(g.expiresAt), now)}
                  </span>
                </div>
                <div className="mono ink3" style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {seated(g) || L("暂无人入座", "no one seated")}
                </div>
                <div>{act(g)}</div>
              </div>
            ))}
          </div>
        </>
      )}
      {sheet && <EntrySheet open onClose={() => setSheet(null)} tier={sheet.tier} mode={sheet.mode} challengeId={sheet.id} />}
    </div>
  );
}
