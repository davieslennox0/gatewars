/** TypeScript mirror of contracts/DuelEngine.sol (must stay bit-identical). */
export const ROUNDS = 20;

export type MatchResult = { scoreA: number; scoreB: number; movesA: number; movesB: number };

export function play(a: bigint, b: bigint, rounds = ROUNDS): MatchResult {
  let ha = 63;
  let hb = 63;
  let sa = 0;
  let sb = 0;
  let ma_ = 0;
  let mb_ = 0;
  for (let r = 0; r < rounds; r++) {
    const ma = Number((a >> BigInt(ha)) & 1n);
    const mb = Number((b >> BigInt(hb)) & 1n);
    const p = (0x33055011 >> (((ma << 1) | mb) << 3)) & 0xff;
    sa += p >> 4;
    sb += p & 0xf;
    ma_ += ma * 2 ** r;
    mb_ += mb * 2 ** r;
    ha = (((ha << 1) | ma) & 7) | (((((ha >> 3) << 1) | mb) & 7) << 3);
    hb = (((hb << 1) | mb) & 7) | (((((hb >> 3) << 1) | ma) & 7) << 3);
  }
  return { scoreA: sa, scoreB: sb, movesA: ma_, movesB: mb_ };
}

export const STARTERS = {
  TIT_FOR_TAT: 0xff00ff00ff00ff00n,
  GRIM_TRIGGER: 0xaa00aa00aa00aa00n,
  ALWAYS_DEFECT: 0x0000000000000000n,
} as const;

/** Scores of `t` against each starter (you, them). */
export function vsStarters(t: bigint) {
  return Object.entries(STARTERS).map(([name, s]) => {
    const r = play(t, s);
    return { opponent: name, you: r.scoreA, them: r.scoreB };
  });
}

/** Unpack a move bitfield (bit r = round r, 1 = C) into a "CCDD…" string. */
export function movesString(m: number | bigint, rounds = ROUNDS): string {
  const x = BigInt(m);
  let s = "";
  for (let r = 0; r < rounds; r++) s += (x >> BigInt(r)) & 1n ? "C" : "D";
  return s;
}
