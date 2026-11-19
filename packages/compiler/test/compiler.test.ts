import { describe, expect, it } from "vitest";
import { compile, dslToTable, inspect, play, STARTERS, vsStarters, MAX_GATES } from "../src/index.js";

// Netlists actually seeded on chain by CircuitRegistry.seedStarters (BSC 0x93280c16…c2c9, ids 1-3).
const ONCHAIN = {
  TIT_FOR_TAT: "0x0000000500000500000008000008",
  GRIM_TRIGGER: "0x0000000200000500000008000008",
  ALWAYS_DEFECT: "0x00000001000001",
};

function rng(seed: bigint) {
  let s = seed;
  return () => {
    s = (s * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n);
    return s;
  };
}

describe("starters", () => {
  it("on-chain starter netlists decode to the starter tables", () => {
    for (const [name, hex] of Object.entries(ONCHAIN)) {
      expect(inspect(hex).table).toBe(STARTERS[name as keyof typeof STARTERS]);
    }
  });

  it("DSL reproduces the three starters", () => {
    expect(dslToTable("cooperate if opp_last == C; default defect")).toBe(STARTERS.TIT_FOR_TAT);
    expect(dslToTable("cooperate if my_last == C and opp_last == C\ndefault defect")).toBe(STARTERS.GRIM_TRIGGER);
    expect(dslToTable("default defect")).toBe(STARTERS.ALWAYS_DEFECT);
  });

  it("compiles the starter tables to their minimal sizes (2, 2, 1 gates)", () => {
    expect(compile(STARTERS.TIT_FOR_TAT).gates).toBe(2);
    expect(compile(STARTERS.GRIM_TRIGGER).gates).toBe(2);
    expect(compile(STARTERS.ALWAYS_DEFECT).gates).toBe(1);
    for (const t of Object.values(STARTERS)) expect(inspect(compile(t).netlist).table).toBe(t);
  });

  it("spec example DSL compiles and fits", () => {
    const c = compile("cooperate if opp_last == C\ndefect if opp_defects_in_last3 >= 2");
    expect(c.fitsRegistry).toBe(true);
    expect(inspect(c.netlist).table).toBe(c.table);
  });

  it("rejects bad DSL with a clear message", () => {
    expect(() => dslToTable("cooperate if foo == C")).toThrow(/unknown variable/);
    expect(() => dslToTable("maybe if opp_last == C")).toThrow(/cannot parse/);
  });
});

describe("duel engine mirror", () => {
  it("matches DuelEngine.sol test vectors", () => {
    expect(play(STARTERS.TIT_FOR_TAT, STARTERS.ALWAYS_DEFECT)).toMatchObject({ scoreA: 19, scoreB: 24, movesA: 1, movesB: 0 });
    expect(play(STARTERS.TIT_FOR_TAT, STARTERS.TIT_FOR_TAT)).toMatchObject({ scoreA: 60, scoreB: 60 });
    expect(play(STARTERS.GRIM_TRIGGER, STARTERS.TIT_FOR_TAT)).toMatchObject({ scoreA: 60, scoreB: 60 });
    expect(vsStarters(STARTERS.ALWAYS_DEFECT).map((r) => r.you)).toEqual([24, 24, 20]);
  });
});

describe("random tables", () => {
  it("1000 random tables all compile, verify on 64 inputs, and fit <= 88 gates", () => {
    const next = rng(20261119n);
    const sizes: number[] = [];
    const over: string[] = [];
    for (let i = 0; i < 1000; i++) {
      const t = next();
      const c = compile(t);
      expect(inspect(c.netlist).table).toBe(t);
      sizes.push(c.gates);
      if (!c.fitsRegistry) over.push(`${c.tableHex}:${c.gates}`);
    }
    sizes.sort((a, b) => a - b);
    const mean = sizes.reduce((s, x) => s + x, 0) / sizes.length;
    console.log(
      `random x1000: min ${sizes[0]} median ${sizes[500]} p99 ${sizes[990]} max ${sizes[999]} mean ${mean.toFixed(1)}; over ${MAX_GATES}: ${over.length}`,
    );
    expect(over).toEqual([]);
  }, 900_000);
});
