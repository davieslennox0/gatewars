"use client";
import Link from "next/link";
import { STARTER_NAMES, displayName, type GameView } from "@/lib/contracts";
import { fmtBnb, fmtUsd8, fmtUsdc, TIER_PART } from "./ui";

type Seat = { label: string; sub?: string; href?: string } | null;

function seatsOf(g: GameView | undefined, size: number): Seat[] {
  return Array.from({ length: size }, (_, i) => {
    const p = g?.players[i];
    if (!p) return null;
    const c = Number(g!.circuits[i]);
    return { label: displayName(g!.handles[i], p), sub: `#${c}${STARTER_NAMES[c] ? ` ${STARTER_NAMES[c]}` : ""}` };
  });
}

function Pin({ seat, side, onTake }: { seat: Seat; side: "left" | "right"; onTake?: () => void }) {
  const label = seat ? (
    <span className="pinlabel" title={`${seat.label} ${seat.sub ?? ""}`}>
      {seat.label}
    </span>
  ) : onTake ? (
    <button className="pinlabel open" onClick={onTake} style={{ border: 0, background: "none", cursor: "pointer", font: "inherit", padding: 0, textAlign: side === "left" ? "right" : "left" }}>
      + TAKE SEAT
    </button>
  ) : (
    <span className="pinlabel open">open</span>
  );
  return (
    <div className="pinrow">
      {side === "left" ? (
        <>
          {label}
          <span className={`pin ${seat ? "on" : ""}`} />
        </>
      ) : (
        <>
          <span className={`pin ${seat ? "on" : ""}`} />
          {label}
        </>
      )}
    </div>
  );
}

/** Rookie = DIP-8 (4+4 pins), Pro = DIP-4 (2+2), Champion = 2-terminal. Each pin is a seat. */
export function ChipSeat({ tier, game, onTake, locked }: { tier: number; game?: GameView; onTake?: () => void; locked?: boolean }) {
  const size = tier === 0 ? 8 : tier === 1 ? 4 : 2;
  const seats = seatsOf(game, size);
  const half = size / 2;
  const filled = game?.players.length ?? 0;
  const left = seats.slice(0, half);
  const right = seats.slice(half);
  if (tier === 2) {
    return (
      <div className="chipwrap" role="group" aria-label={`Champion challenge chip, ${filled} of 2 seats`}>
        <div className="pins left" style={{ height: 72 }}>
          <Pin seat={seats[0]} side="left" onTake={onTake} />
        </div>
        <div className="chipbody c2">
          <span className="pn">{TIER_PART[2]}</span>
          <span className="sub">{game ? `${filled}/2 · TABLE #${game.id}` : "1V1 · OPEN"}</span>
        </div>
        <div className="pins right" style={{ height: 72 }}>
          <Pin seat={seats[1]} side="right" onTake={game ? onTake : undefined} />
        </div>
      </div>
    );
  }
  return (
    <div className="chipwrap" role="group" aria-label={`${TIER_PART[tier]} chip, ${filled} of ${size} seats filled`}>
      <div className="pins left">
        {left.map((s, i) => (
          <Pin key={i} seat={s} side="left" onTake={locked ? undefined : onTake} />
        ))}
      </div>
      <div className="chipbody" style={tier === 1 ? { height: 96 } : undefined}>
        {locked && (
          <svg width="14" height="16" viewBox="0 0 14 16" aria-hidden fill="none" stroke="var(--slate)" strokeWidth="1.5">
            <rect x="1.5" y="7" width="11" height="8" rx="1" />
            <path d="M4 7V4.5a3 3 0 0 1 6 0V7" />
          </svg>
        )}
        <span className="pn">{TIER_PART[tier]}</span>
        <span className="sub">
          {filled}/{size}
        </span>
        <span className="sub">{game ? `TABLE #${game.id}` : "NO TABLE"}</span>
      </div>
      <div className="pins right" style={tier === 1 ? { height: 96 } : undefined}>
        {right.map((s, i) => (
          <Pin key={i} seat={s} side="right" onTake={locked ? undefined : onTake} />
        ))}
      </div>
    </div>
  );
}

export function PoolValue({ g, fallbackUsd }: { g?: GameView; fallbackUsd?: string }) {
  return (
    <div>
      <div className="mono" style={{ fontSize: 13, fontWeight: 600 }}>
        POOL ≈ {g ? fmtUsd8(g.poolUsd) : fallbackUsd ?? "$0.00"}
      </div>
      {g && (
        <div className="label sm" style={{ textTransform: "none", letterSpacing: "0.04em" }}>
          {fmtBnb(g.poolBnb, 5)} + {fmtUsdc(g.poolUsdc)}
        </div>
      )}
    </div>
  );
}

/** 8×8 LED view of a 64-entry table (rows = opponent last 3, cols = my last 3, newest first, CCC..DDD). */
export function LedTable({ table, size = 12 }: { table: bigint; size?: number }) {
  const cells: JSX.Element[] = [];
  for (let row = 0; row < 8; row++)
    for (let col = 0; col < 8; col++) {
      const k = ledIndex(col, row);
      cells.push(<span key={k} className={`led ${(table >> BigInt(k)) & 1n ? "on" : ""}`} style={{ width: size, height: size }} />);
    }
  return (
    <div className="leds" role="img" style={{ gridTemplateColumns: `repeat(8, ${size}px)` }} aria-label="strategy truth table">
      {cells}
    </div>
  );
}

/** Labels CCC, CCD, …, DDD with chars = (t-1, t-2, t-3); C = 1. */
export const TRIPLES = ["CCC", "CCD", "CDC", "CDD", "DCC", "DCD", "DDC", "DDD"];
export function bitsOf(lbl: string) {
  return (lbl[0] === "C" ? 1 : 0) | (lbl[1] === "C" ? 2 : 0) | (lbl[2] === "C" ? 4 : 0);
}
export function ledIndex(col: number, row: number) {
  return bitsOf(TRIPLES[col]) | (bitsOf(TRIPLES[row]) << 3);
}

export function CircuitCard({ id, gates, name, table, note, href }: { id: number; gates?: number; name: string; table: bigint; note: string; href?: string }) {
  return (
    <div className="panel pad col gap-8">
      <div className="row between">
        <span className="label">CIRCUIT #{id}</span>
        {gates !== undefined && <span className="label">{gates} GATES</span>}
      </div>
      <div className="mono" style={{ fontWeight: 700, fontSize: 15 }}>
        {href ? <Link href={href}>{name}</Link> : name}
      </div>
      <LedTable table={table} />
      <div className="ink3" style={{ fontSize: 13 }}>
        {note}
      </div>
    </div>
  );
}
