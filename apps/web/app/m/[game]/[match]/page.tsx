import type { Metadata } from "next";
import Link from "next/link";
import { TIERS } from "@/lib/contracts";
import { loadMatch } from "@/lib/server";
import DuelScope, { MoveLog } from "@/components/DuelScope";
import { T } from "@/lib/i18n";

export const revalidate = 60;

type P = { params: { game: string; match: string } };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const m = await loadMatch(Number(params.game), Number(params.match)).catch(() => null);
  const title = m ? `${m.a} ${m.scoreA}–${m.scoreB} ${m.b} · GateWars table #${params.game}` : "GateWars match";
  return { title, openGraph: { title, description: "20-round prisoner's dilemma duel between two logic circuits on BSC." }, twitter: { card: "summary_large_image", title } };
}

export default async function MatchShare({ params }: P) {
  const m = await loadMatch(Number(params.game), Number(params.match)).catch(() => null);
  if (!m) return <p style={{ marginTop: 40 }}><T zh="未找到该对局。" en="Match not found." /></p>;
  const url = `https://gatewars.vercel.app/m/${params.game}/${params.match}`;
  return (
    <section style={{ padding: "32px 0" }}>
      <span className="label">
        <T zh="牌桌" en="TABLE" /> #{params.game} · {TIERS[m.g.tier]} · <T zh="对局" en="MATCH" /> {String(Number(params.match) + 1).padStart(2, "0")}/{m.total} {m.played ? "" : <T zh="· 预览（尚未开赛）" en="· PREVIEW (NOT PLAYED YET)" />}
      </span>
      <h1 style={{ marginTop: 8, fontSize: "clamp(28px, 5vw, 44px)" }}>
        {m.a} {m.scoreA}–{m.scoreB} {m.b}
      </h1>
      <div style={{ marginTop: 20 }}>
        <DuelScope nameA={m.a} nameB={m.b} movesA={m.movesA} movesB={m.movesB} mode="replay" shareUrl={url} />
      </div>
      <div style={{ marginTop: 12 }}>
        <MoveLog movesA={m.movesA} movesB={m.movesB} />
      </div>
      <div className="row" style={{ marginTop: 20 }}>
        <Link href={`/arena/${params.game}`} className="btn outline">
          <T zh="查看整桌 →" en="FULL TABLE →" />
        </Link>
        <Link href="/builder" className="btn">
          <T zh="设计反制电路" en="BUILD A COUNTER-CIRCUIT" />
        </Link>
      </div>
    </section>
  );
}
