/**
 * Synthesis: 64-entry truth table -> minimal-ish NAND netlist.
 *
 * Candidates (the smallest wins, every candidate is verified by simulation):
 *  1. ROBDD under all 720 variable orders, each node mapped to a NAND mux with constant folding,
 *     polarity reuse and structural hashing.
 *  2. Two-level SOP from Quine-McCluskey prime implicants (exact cover by branch-and-bound, which is
 *     cheap at 6 inputs), mapped to NAND-NAND; and the same for the complement, inverted.
 */
import { Builder, Gate, N_IN, tableOf } from "./netlist.js";

const ALL = (1n << 64n) - 1n;

/** Cofactor of table f with input v fixed to b (result no longer depends on v). */
const M0: bigint[] = [0, 1, 2, 3, 4, 5].map((v) => {
  let m = 0n;
  for (let k = 0; k < 64; k++) if (!((k >> v) & 1)) m |= 1n << BigInt(k);
  return m;
});
const SH = [1n, 2n, 4n, 8n, 16n, 32n];

export function cofactor(f: bigint, v: number, b: 0 | 1): bigint {
  if (b === 0) {
    const lo = f & M0[v];
    return lo | (lo << SH[v]);
  }
  const hi = f & ~M0[v] & ALL;
  return hi | (hi >> SH[v]);
}

function dependsOn(f: bigint, v: number): boolean {
  return cofactor(f, v, 0) !== cofactor(f, v, 1);
}

function permutations(xs: number[]): number[][] {
  if (xs.length <= 1) return [xs];
  const out: number[][] = [];
  xs.forEach((x, i) => {
    for (const p of permutations([...xs.slice(0, i), ...xs.slice(i + 1)])) out.push([x, ...p]);
  });
  return out;
}
const ORDERS = permutations([0, 1, 2, 3, 4, 5]);

function bddNetlist(table: bigint, order: number[]): Gate[] {
  const b = new Builder();
  const memo = new Map<bigint, number>();
  const cof = new Map<string, bigint>();
  const cf = (f: bigint, v: number, x: 0 | 1) => {
    const key = `${f},${v},${x}`;
    let r = cof.get(key);
    if (r === undefined) {
      r = cofactor(f, v, x);
      cof.set(key, r);
    }
    return r;
  };
  const build = (f: bigint): number => {
    if (f === 0n) return 0;
    if (f === ALL) return 1;
    const hit = memo.get(f);
    if (hit !== undefined) return hit;
    const v = order.find((x) => cf(f, x, 0) !== cf(f, x, 1))!;
    const lo = build(cf(f, v, 0));
    const hi = build(cf(f, v, 1));
    const s = b.mux(b.input(v), lo, hi);
    memo.set(f, s);
    return s;
  };
  return b.finish(build(table));
}

// ---------------------------------------------------------------- Quine-McCluskey

type Cube = { val: number; mask: number }; // mask bit 1 = don't care

function primes(minterms: number[]): Cube[] {
  let level: Cube[] = minterms.map((m) => ({ val: m, mask: 0 }));
  const result: Cube[] = [];
  while (level.length) {
    const used = new Set<number>();
    const next = new Map<string, Cube>();
    for (let i = 0; i < level.length; i++) {
      for (let j = i + 1; j < level.length; j++) {
        const a = level[i];
        const c = level[j];
        if (a.mask !== c.mask) continue;
        const d = a.val ^ c.val;
        if (d && (d & (d - 1)) === 0) {
          const cube = { val: a.val & ~d, mask: a.mask | d };
          next.set(`${cube.val},${cube.mask}`, cube);
          used.add(i);
          used.add(j);
        }
      }
    }
    level.forEach((c, i) => {
      if (!used.has(i)) result.push(c);
    });
    level = [...next.values()];
  }
  const seen = new Set<string>();
  return result.filter((c) => {
    const k = `${c.val},${c.mask}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

const covers = (c: Cube, m: number) => (m & ~c.mask) === c.val;
const literals = (c: Cube) => N_IN - popcount(c.mask);
function popcount(x: number) {
  let n = 0;
  while (x) {
    x &= x - 1;
    n++;
  }
  return n;
}

/** Minimum-literal cover (branch and bound; essential primes first). */
function minCover(minterms: number[], ps: Cube[]): Cube[] {
  let best: Cube[] | null = null;
  let bestCost = Infinity;
  const cost = (cs: Cube[]) => cs.reduce((s, c) => s + literals(c) + 1, 0);
  let budget = 20_000; // search nodes; the first (greedy-ordered) leaf is always reached
  const rec = (left: number[], chosen: Cube[], avail: Cube[]) => {
    if (cost(chosen) >= bestCost) return;
    if (best && --budget < 0) return;
    if (!left.length) {
      best = [...chosen];
      bestCost = cost(chosen);
      return;
    }
    // pick the minterm with the fewest covering primes
    let pick = left[0];
    let opts = avail.filter((c) => covers(c, pick));
    for (const m of left) {
      const o = avail.filter((c) => covers(c, m));
      if (o.length < opts.length) {
        pick = m;
        opts = o;
      }
    }
    opts.sort((a, b) => literals(a) - literals(b));
    for (const c of opts) rec(left.filter((m) => !covers(c, m)), [...chosen, c], avail);
  };
  rec(minterms, [], ps);
  return best ?? [];
}

function sopNetlist(table: bigint, invert: boolean): Gate[] | null {
  const f = invert ? ~table & ALL : table;
  const ms: number[] = [];
  for (let k = 0; k < 64; k++) if ((f >> BigInt(k)) & 1n) ms.push(k);
  const b = new Builder();
  let root: number;
  if (!ms.length) root = 0;
  else if (ms.length === 64) root = 1;
  else {
    const cover = minCover(ms, primes(ms));
    const terms = cover.map((c) => {
      let t = 1;
      for (let i = 0; i < N_IN; i++) {
        if ((c.mask >> i) & 1) continue;
        const lit = (c.val >> i) & 1 ? b.input(i) : b.not(b.input(i));
        t = b.and(t, lit);
      }
      return t;
    });
    root = terms.reduce((acc, t) => b.or(acc, t), 0);
  }
  if (invert) root = b.not(root);
  return b.finish(root);
}

export type SynthResult = { gates: Gate[]; method: string };

/** Smallest verified netlist for a table. */
export function synthesize(table: bigint): SynthResult {
  table &= ALL;
  let best: SynthResult | null = null;
  const consider = (g: Gate[] | null, method: string) => {
    if (!g) return;
    if (tableOf(g) !== table) throw new Error(`internal: ${method} produced a wrong netlist`);
    if (!best || g.length < best.gates.length) best = { gates: g, method };
  };
  // relevant variables only, to cut orders when the function ignores some inputs
  const deps = [0, 1, 2, 3, 4, 5].filter((v) => dependsOn(table, v));
  const orders = deps.length < 6 ? permutations(deps) : ORDERS;
  for (const o of orders) consider(bddNetlist(table, o.length ? o : [0]), `bdd[${o.join("")}]`);
  consider(sopNetlist(table, false), "sop");
  consider(sopNetlist(table, true), "sop-complement");
  return best!;
}
