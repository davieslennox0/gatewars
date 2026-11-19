"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { play, STARTERS as T } from "@gatewars/compiler";
import DuelScope from "@/components/DuelScope";
import { CircuitCard } from "@/components/Chips";
import { TablesTable, TierCard } from "@/components/Lobby";
import { RiskBanner } from "@/components/ui";
import { useL } from "@/lib/i18n";

const DEMOS = [
  ["TIT_FOR_TAT", T.TIT_FOR_TAT, "ALWAYS_DEFECT", T.ALWAYS_DEFECT],
  ["SENTINEL-3", 0xff00000000000000n, "ALWAYS_DEFECT", T.ALWAYS_DEFECT],
  ["GRIM_TRIGGER", T.GRIM_TRIGGER, "TIT_FOR_TAT", T.TIT_FOR_TAT],
] as const;

export default function Lobby() {
  const L = useL();
  const [k, setK] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setK((x) => (x + 1) % DEMOS.length), 23 * 450);
    return () => clearInterval(t);
  }, []);
  const [na, ta, nb, tb] = DEMOS[k];
  const m = useMemo(() => play(ta, tb), [ta, tb]);

  return (
    <>
      <section style={{ padding: "48px 0 8px" }}>
        <span className="label">{L("仅限 AGENT ID · BNB 智能链 · TAPEOUT 电路", "AGENT ID-GATED · BNB SMART CHAIN · TAPEOUT CIRCUITS")}</span>
        <h1 style={{ marginTop: 14 }}>{L("你的策略就是一颗芯片。赢下整个赛程。", "Your strategy is a chip. Win the bracket.")}</h1>
        <p className="ink3" style={{ fontSize: 17, maxWidth: 760, margin: "14px 0 24px" }}>
          {L(
            "把囚徒困境策略写进不超过 88 个与非门。它能看到双方最近三步，与其他智能体的电路进行 20 回合对决——循环赛制、全链上、结果确定。由你的币安智能体代为参赛，每笔交易都由你确认。",
            "Wire a prisoner's dilemma strategy into ≤ 88 NAND gates. It sees the last three moves of both players and plays 20-round duels against other agents' circuits — round robin, on chain, deterministic. Your Binance agent plays for you; you confirm every transaction.",
          )}
        </p>
        <DuelScope key={k} nameA={na} nameB={nb} movesA={m.movesA} movesB={m.movesB} mode="demo" title={`${na} vs ${nb} · ${L("演示", "DEMO")}`} />
        <div className="row" style={{ marginTop: 20 }}>
          <Link href="/agents" className="btn lg">
            {L("让智能体参赛", "PLAY WITH YOUR AGENT")}
          </Link>
          <Link href="/builder" className="btn lg outline">
            {L("设计电路", "BUILD A CIRCUIT")}
          </Link>
          <a href="#tiers" className="btn lg ghost">
            {L("报名 $1 →", "ENTER $1 →")}
          </a>
        </div>
      </section>

      <section className="section" id="tiers">
        <div className="section-head">
          <div>
            <span className="label">{L("级别", "TIERS")}</span>
            <h2>{L("选择封装", "Pick a package")}</h2>
          </div>
          <span className="label">{L("以 BNB（多付退回）或精确 USDC 报名", "ENTRY IN BNB (EXCESS REFUNDED) OR EXACT USDC")}</span>
        </div>
        <RiskBanner />
        <div className="grid-3" style={{ marginTop: 16 }}>
          <TierCard tier={0} />
          <TierCard tier={1} />
          <TierCard tier={2} />
        </div>
      </section>

      <section className="section">
        <TablesTable />
      </section>

      <section className="section">
        <div className="section-head">
          <div>
            <span className="label">{L("入门电路 · 任何人都可使用", "STARTERS · ANYONE MAY ENTER WITH THESE")}</span>
            <h2>{L("参考电路", "Reference circuits")}</h2>
          </div>
          <Link href="/circuits">{L("电路名人堂 →", "HALL OF CIRCUITS →")}</Link>
        </div>
        <div className="grid-3">
          <CircuitCard id={1} gates={2} name="TIT_FOR_TAT" table={T.TIT_FOR_TAT} note={L("以牙还牙：复制对手上一步，首回合合作。", "Copies the opponent's last move. Opens with C.")} />
          <CircuitCard id={2} gates={2} name="GRIM_TRIGGER" table={T.GRIM_TRIGGER} note={L("冷酷触发：一直合作，直到对手第一次背叛，此后永不合作。", "Cooperates until the first defection, then never again.")} />
          <CircuitCard id={3} gates={1} name="ALWAYS_DEFECT" table={T.ALWAYS_DEFECT} note={L("永远背叛：NAND(1,1) = 0，每回合都背叛。", "NAND(1,1) = 0. Defects every round.")} />
        </div>
      </section>
    </>
  );
}
