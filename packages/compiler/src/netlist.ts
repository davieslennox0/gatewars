/**
 * TAP-02 NAND netlists for GateWars strategies (6 inputs, 1 output).
 *
 * Signals: 0 = const 0, 1 = const 1, 2..7 = inputs 0..5, then one signal per NAND record in order.
 * Record: 0x00 a:u24 b:u24 (big-endian), 7 bytes. The output is the LAST signal (TAP-02 §4).
 *
 * Input encoding (GateWars, matches CircuitRegistry/DuelEngine): packed input k, bit i = input i:
 *   bit0 own t-1, bit1 own t-2, bit2 own t-3, bit3 opp t-1, bit4 opp t-2, bit5 opp t-3. 1 = cooperate.
 * Table bit k = output for packed input k.
 */

export const N_IN = 6;
export const MAX_GATES = 88;
export const FIRST_GATE = 2 + N_IN;

export type Gate = [number, number];

/** NAND builder with constant folding, double-negation removal and structural hashing. */
export class Builder {
  gates: Gate[] = [];
  private memo = new Map<string, number>();

  input(i: number): number {
    return 2 + i;
  }

  private isGate(s: number) {
    return s >= FIRST_GATE;
  }

  private g(s: number): Gate {
    return this.gates[s - FIRST_GATE];
  }

  nand(a: number, b: number): number {
    if (a > b) [a, b] = [b, a];
    if (a === 0) return 1; // NAND(0,x) = 1
    if (a === 1 && b === 1) return 0;
    if (a === 1) return this.not(b);
    return this.raw(a, b);
  }

  private raw(a: number, b: number): number {
    const key = `${a},${b}`;
    const hit = this.memo.get(key);
    if (hit !== undefined) return hit;
    this.gates.push([a, b]);
    const s = FIRST_GATE + this.gates.length - 1;
    this.memo.set(key, s);
    return s;
  }

  not(x: number): number {
    if (x === 0) return 1;
    if (x === 1) return 0;
    if (this.isGate(x)) {
      const [a, b] = this.g(x);
      if (a === b) return a; // NOT(NOT a) = a
    }
    return this.raw(x, x);
  }

  and(a: number, b: number): number {
    if (a === 0 || b === 0) return 0;
    if (a === 1) return b;
    if (b === 1) return a;
    if (a === b) return a;
    return this.not(this.nand(a, b));
  }

  or(a: number, b: number): number {
    if (a === 1 || b === 1) return 1;
    if (a === 0) return b;
    if (b === 0) return a;
    if (a === b) return a;
    return this.nand(this.not(a), this.not(b));
  }

  /** s ? hi : lo */
  mux(s: number, lo: number, hi: number): number {
    if (lo === hi) return lo;
    if (lo === 0 && hi === 1) return s;
    if (lo === 1 && hi === 0) return this.not(s);
    if (lo === 0) return this.and(s, hi);
    if (hi === 0) return this.and(this.not(s), lo);
    if (lo === 1) return this.nand(s, this.not(hi)); // !s | hi
    if (hi === 1) return this.nand(this.not(s), this.not(lo)); // s | lo
    return this.nand(this.nand(lo, this.not(s)), this.nand(hi, s));
  }

  /** Dead-code elimination + renumbering; the output becomes the last record. */
  finish(root: number): Gate[] {
    if (!this.isGate(root)) {
      if (root === 0) return [[1, 1]]; // NAND(1,1) = 0
      if (root === 1) return [[0, 0]]; // NAND(0,0) = 1
      return [
        [root, root],
        [FIRST_GATE, FIRST_GATE],
      ]; // identity of an input = NOT NOT x
    }
    const live = new Set<number>();
    const stack = [root];
    while (stack.length) {
      const s = stack.pop()!;
      if (!this.isGate(s) || live.has(s)) continue;
      live.add(s);
      const [a, b] = this.g(s);
      stack.push(a, b);
    }
    const order = [...live].sort((x, y) => x - y); // creation order is topological; root is last
    const remap = new Map<number, number>();
    order.forEach((s, i) => remap.set(s, FIRST_GATE + i));
    const m = (s: number) => (this.isGate(s) ? remap.get(s)! : s);
    return order.map((s) => {
      const [a, b] = this.g(s);
      return [m(a), m(b)] as Gate;
    });
  }
}

export function encode(gates: Gate[]): Uint8Array {
  const out = new Uint8Array(gates.length * 7);
  gates.forEach(([a, b], i) => {
    const o = i * 7;
    out[o] = 0;
    out[o + 1] = (a >> 16) & 0xff;
    out[o + 2] = (a >> 8) & 0xff;
    out[o + 3] = a & 0xff;
    out[o + 4] = (b >> 16) & 0xff;
    out[o + 5] = (b >> 8) & 0xff;
    out[o + 6] = b & 0xff;
  });
  return out;
}

export function toHex(bytes: Uint8Array): `0x${string}` {
  return `0x${Array.from(bytes, (x) => x.toString(16).padStart(2, "0")).join("")}`;
}

export function fromHex(hex: string): Uint8Array {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (h.length % 2) throw new Error("odd hex length");
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(2 * i, 2 * i + 2), 16);
  return out;
}

/** Decodes and validates a GateWars netlist exactly as CircuitRegistry.gateCount + TAP-02 §3 would. */
export function decode(bytes: Uint8Array): Gate[] {
  if (bytes.length === 0 || bytes.length % 7 !== 0) throw new Error("BadNetlist: length must be a non-zero multiple of 7");
  const gates: Gate[] = [];
  for (let o = 0; o < bytes.length; o += 7) {
    if (bytes[o] !== 0) throw new Error("BadNetlist: only NAND records (0x00) are accepted");
    const a = (bytes[o + 1] << 16) | (bytes[o + 2] << 8) | bytes[o + 3];
    const b = (bytes[o + 4] << 16) | (bytes[o + 5] << 8) | bytes[o + 6];
    const self = FIRST_GATE + gates.length;
    if (a >= self || b >= self) throw new Error("NAND: future signal");
    gates.push([a, b]);
  }
  return gates;
}

/** One combinational beat (TAP-02 §4) for packed input k. */
export function evalNetlist(gates: Gate[], k: number): number {
  const s = new Uint8Array(FIRST_GATE + gates.length);
  s[1] = 1;
  for (let i = 0; i < N_IN; i++) s[2 + i] = (k >> i) & 1;
  for (let j = 0; j < gates.length; j++) {
    const [a, b] = gates[j];
    s[FIRST_GATE + j] = 1 - (s[a] & s[b]);
  }
  return s[s.length - 1];
}

/** 64-entry table of a netlist (bit k = output for packed input k). */
export function tableOf(gates: Gate[]): bigint {
  let t = 0n;
  for (let k = 0; k < 64; k++) if (evalNetlist(gates, k)) t |= 1n << BigInt(k);
  return t;
}
