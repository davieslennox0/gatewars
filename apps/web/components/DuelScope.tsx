"use client";
import { useEffect, useRef, useState } from "react";
import { movesString } from "@gatewars/compiler";

const ROUNDS = 20;
const W = 50; // px per round in the 1000-wide viewBox
const HI = 10;
const LO = 50;

export function payoff(a: string, b: string) {
  if (a === "C" && b === "C") return [3, 3];
  if (a === "D" && b === "C") return [5, 0];
  if (a === "C" && b === "D") return [0, 5];
  return [1, 1];
}

export function cumulative(A: string, B: string, upto: number) {
  let sa = 0;
  let sb = 0;
  for (let i = 0; i < upto; i++) {
    const [pa, pb] = payoff(A[i], B[i]);
    sa += pa;
    sb += pb;
  }
  return [sa, sb];
}

function useReducedMotion() {
  const [r, setR] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setR(m.matches);
    const f = () => setR(m.matches);
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, []);
  return r;
}

/** One channel: square wave, HIGH (y=10) = C in coop color, LOW (y=50) = D in defect color. */
function Wave({ moves, upto, label }: { moves: string; upto: number; label: string }) {
  const segs: JSX.Element[] = [];
  for (let r = 0; r < upto; r++) {
    const y = moves[r] === "C" ? HI : LO;
    const x0 = r * W;
    segs.push(<line key={`h${r}`} x1={x0} x2={x0 + W} y1={y} y2={y} stroke={moves[r] === "C" ? "var(--coop)" : "var(--defect)"} strokeWidth={3} />);
    if (r > 0 && moves[r] !== moves[r - 1]) segs.push(<line key={`v${r}`} x1={x0} x2={x0} y1={HI} y2={LO} stroke="var(--slate)" strokeWidth={2} />);
  }
  return (
    <svg viewBox="0 0 1000 60" preserveAspectRatio="none" role="img" aria-label={label}>
      {Array.from({ length: ROUNDS + 1 }, (_, r) => (
        <line key={r} x1={r * W} x2={r * W} y1={0} y2={60} stroke="var(--line-3)" strokeWidth={1} />
      ))}
      <line x1={0} x2={1000} y1={30} y2={30} stroke="var(--line-3)" strokeWidth={1} strokeDasharray="2 6" />
      {segs}
      {upto > 0 && upto < ROUNDS + 1 && <line x1={upto * W} x2={upto * W} y1={0} y2={60} stroke="var(--slate)" strokeWidth={2} strokeDasharray="4 4" />}
    </svg>
  );
}

type Props = {
  nameA: string;
  nameB: string;
  movesA: number | bigint;
  movesB: number | bigint;
  title?: string;
  /** "demo": autoplay loop. "replay": controls + scrubber + copy link. "static": round 20. */
  mode?: "demo" | "replay" | "static";
  shareUrl?: string;
  compact?: boolean;
};

export default function DuelScope({ nameA, nameB, movesA, movesB, title, mode = "demo", shareUrl, compact }: Props) {
  const reduced = useReducedMotion();
  const A = movesString(movesA);
  const B = movesString(movesB);
  const [round, setRound] = useState(mode === "static" ? ROUNDS : 0);
  const [playing, setPlaying] = useState(mode !== "static");
  const [copied, setCopied] = useState(false);
  const last = useRef(0);

  // reset when the match changes
  useEffect(() => {
    setRound(mode === "static" || reduced ? ROUNDS : 0);
    setPlaying(mode !== "static" && !reduced);
  }, [movesA, movesB, mode, reduced]);

  // rAF clock, 450ms per round; demo loops (hold 2 rounds at the end), replay stops at 20
  useEffect(() => {
    if (!playing || reduced) return;
    let id = 0;
    const tick = (t: number) => {
      if (!last.current) last.current = t;
      if (t - last.current >= 450) {
        last.current = t;
        setRound((r) => {
          if (mode === "demo") return r >= ROUNDS + 2 ? 0 : r + 1;
          if (r >= ROUNDS) {
            setPlaying(false);
            return ROUNDS;
          }
          return r + 1;
        });
      }
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(id);
      last.current = 0;
    };
  }, [playing, reduced, mode]);

  const shown = Math.min(round, ROUNDS);
  const [sa, sb] = cumulative(A, B, shown);
  const hex = (n: number) => `0x${n.toString(16).toUpperCase().padStart(2, "0")}`;

  return (
    <div className="scope">
      <div className="scope-head">
        <span>
          DUELSCOPE · <b>{title ?? `${nameA} vs ${nameB}`}</b>
        </span>
        <span>
          ROUND <b>{String(shown).padStart(2, "0")}/20</b>
        </span>
      </div>
      {[
        ["CH_A", nameA, A, sa],
        ["CH_B", nameB, B, sb],
      ].map(([ch, nm, mv, sc]) => (
        <div className="chan" key={ch as string}>
          <div className="tag">
            <span className="ch">{ch as string}</span>
            <span className="nm" title={nm as string}>
              {nm as string}
            </span>
          </div>
          <Wave moves={mv as string} upto={shown} label={`${nm}: ${(mv as string).slice(0, shown) || "no moves yet"}`} />
          <div className="score">
            <div className="k">SCORE</div>
            <div className="v">
              {compact ? sc : `${hex(sc as number)} / ${sc}`}
            </div>
          </div>
        </div>
      ))}
      {mode === "replay" && (
        <div className="scope-ctrl">
          <button className="btn outline icon" aria-label="Previous round" onClick={() => { setPlaying(false); setRound((r) => Math.max(0, Math.min(r, ROUNDS) - 1)); }}>
            ◀
          </button>
          <button
            className="btn icon"
            aria-label={playing ? "Pause" : "Play"}
            onClick={() => {
              if (!playing && round >= ROUNDS) setRound(0);
              setPlaying(!playing);
            }}
          >
            {playing ? "❚❚" : "▶"}
          </button>
          <button className="btn outline icon" aria-label="Next round" onClick={() => { setPlaying(false); setRound((r) => Math.min(ROUNDS, r + 1)); }}>
            ▶
          </button>
          <input type="range" min={0} max={ROUNDS} value={shown} aria-label="Scrub rounds" onChange={(e) => { setPlaying(false); setRound(Number(e.target.value)); }} />
          {shareUrl && (
            <button
              className="btn outline"
              onClick={() => {
                navigator.clipboard.writeText(shareUrl).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                });
              }}
            >
              {copied ? "COPIED" : "COPY REPLAY LINK"}
            </button>
          )}
        </div>
      )}
      <div className="scope-foot">
        <span className="legend">
          <span>
            <i style={{ background: "var(--coop)" }} />
            HIGH = C COOPERATE
          </span>
          <span>
            <i style={{ background: "var(--defect)" }} />
            LOW = D DEFECT
          </span>
        </span>
        <span>PAYOFF CC 3/3 · DC 5/0 · CD 0/5 · DD 1/1</span>
      </div>
    </div>
  );
}

/** Grid: 60px label column + 20 rounds; rows R / A / B / PAY; current round highlighted. */
export function MoveLog({ movesA, movesB, round = 20 }: { movesA: number | bigint; movesB: number | bigint; round?: number }) {
  const A = movesString(movesA);
  const B = movesString(movesB);
  const cells: JSX.Element[] = [];
  const cur = (r: number) => (r === round - 1 ? " cur" : "");
  cells.push(<div key="rl" className="rl">R</div>);
  for (let r = 0; r < 20; r++) cells.push(<div key={`r${r}`} className={`muted${cur(r)}`}>{r + 1}</div>);
  for (const [lbl, row] of [["A", A], ["B", B]] as const) {
    cells.push(<div key={`l${lbl}`} className="rl">{lbl}</div>);
    for (let r = 0; r < 20; r++) cells.push(<div key={`${lbl}${r}`} className={`${row[r]}${cur(r)}`}>{row[r]}</div>);
  }
  cells.push(<div key="lp" className="rl">PAY</div>);
  for (let r = 0; r < 20; r++) {
    const [pa, pb] = payoff(A[r], B[r]);
    cells.push(<div key={`p${r}`} className={`ink3${cur(r)}`}>{pa}/{pb}</div>);
  }
  return (
    <div style={{ overflowX: "auto" }}>
      <div className="movelog">{cells}</div>
    </div>
  );
}
