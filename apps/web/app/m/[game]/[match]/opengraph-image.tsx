import { ImageResponse } from "next/og";
import { movesString } from "@gatewars/compiler";
import { TIERS } from "@/lib/contracts";
import { loadMatch } from "@/lib/server";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "GateWars DuelScope";

function Lane({ moves }: { moves: string }) {
  return (
    <div style={{ display: "flex", height: 70, width: 1000, borderTop: "1px solid #E8ECF0" }}>
      {Array.from(moves).map((c, i) => (
        <div key={i} style={{ width: 50, height: 70, display: "flex", flexDirection: "column", justifyContent: c === "C" ? "flex-start" : "flex-end", padding: "10px 0", borderLeft: "1px solid #E8ECF0" }}>
          <div style={{ height: 4, background: c === "C" ? "#2F6FA3" : "#D9773E" }} />
        </div>
      ))}
    </div>
  );
}

export default async function Image({ params }: { params: { game: string; match: string } }) {
  const m = await loadMatch(Number(params.game), Number(params.match)).catch(() => null);
  const A = m ? movesString(m.movesA) : "C".repeat(20);
  const B = m ? movesString(m.movesB) : "D".repeat(20);
  return new ImageResponse(
    (
      <div style={{ width: 1200, height: 630, background: "#EEF1F4", display: "flex", flexDirection: "column", padding: 60, fontFamily: "monospace", color: "#161B22" }}>
        <div style={{ display: "flex", fontSize: 22, letterSpacing: 4, color: "#5F6B77" }}>
          GATEWARS · DUELSCOPE · TABLE #{params.game} {m ? `· ${TIERS[m.g.tier]}` : ""}
        </div>
        <div style={{ display: "flex", fontSize: 56, fontWeight: 700, marginTop: 18 }}>
          {m ? `${m.a} ${m.scoreA}–${m.scoreB} ${m.b}` : "GateWars match"}
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 40, background: "#FFFFFF", border: "1px solid #DCE2E8", padding: 24 }}>
          {[["CH_A", m?.a ?? "A", A, m?.scoreA], ["CH_B", m?.b ?? "B", B, m?.scoreB]].map(([ch, nm, mv, sc]) => (
            <div key={ch as string} style={{ display: "flex", alignItems: "center" }}>
              <div style={{ display: "flex", flexDirection: "column", width: 80, fontSize: 16 }}>
                <span style={{ background: "#4B5B6B", color: "#fff", padding: "2px 6px" }}>{ch as string}</span>
              </div>
              <Lane moves={mv as string} />
              <div style={{ display: "flex", fontSize: 30, fontWeight: 700, marginLeft: 16 }}>{String(sc ?? "")}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", marginTop: 26, fontSize: 20, color: "#5F6B77" }}>HIGH = C COOPERATE · LOW = D DEFECT · 20 ROUNDS · gatewars.vercel.app</div>
      </div>
    ),
    size,
  );
}
