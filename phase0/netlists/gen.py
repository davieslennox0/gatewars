"""GateWars Phase 0 netlist generator.

Builds TAP-02 netlists (NAND records only) for the reference strategies and the argmax comparator,
checks each one with the TAP-02 reference implementation (tap02_reference.py, copied verbatim from
TapeOutProtocol/TAPs assets/tap-02), and writes:

  out/netlists.json         name -> {hex, nIn, nOut, gates, table/vectors}
  ../test/Netlists.sol      Solidity constants for the Foundry fork tests

Input convention for strategies (6 inputs, bit i of the packed input byte = input i, TAP-02 §5):
  in0 = my move t-1, in1 = my move t-2, in2 = my move t-3
  in3 = opp move t-1, in4 = opp move t-2, in5 = opp move t-3
  1 = cooperate, 0 = defect. Before round 1 the history is padded with 1s (cooperate).
So the cached table bit k is the strategy's output for packed input byte k (0..63).
"""
from __future__ import annotations

import json
import pathlib
import random

import tap02_reference as ref

HERE = pathlib.Path(__file__).parent


class B:
    """Minimal NAND netlist builder. Signals: 0 = const 0, 1 = const 1, 2.. = inputs, then gates."""

    def __init__(self, n_in: int):
        self.n_in = n_in
        self.recs: list[tuple[int, int]] = []

    def inp(self, i):
        return 2 + i

    def nand(self, a, b):
        self.recs.append((a, b))
        return 2 + self.n_in + len(self.recs) - 1

    def not_(self, a):
        if a == 0:
            return 1
        if a == 1:
            return 0
        return self.nand(a, a)

    def and_(self, a, b):
        if 0 in (a, b):
            return 0
        if a == 1:
            return b
        if b == 1:
            return a
        return self.not_(self.nand(a, b))

    def or_(self, a, b):
        if 1 in (a, b):
            return 1
        if a == 0:
            return b
        if b == 0:
            return a
        return self.nand(self.not_(a), self.not_(b))

    def mux(self, s, a, b, ns=None):
        """s ? b : a, with constant folding."""
        if a == b:
            return a
        if (a, b) == (0, 1):
            return s
        if (a, b) == (1, 0):
            return ns if ns is not None else self.not_(s)
        if a == 0:
            return self.and_(s, b)
        if b == 0:
            return self.and_(ns if ns is not None else self.not_(s), a)
        ns = ns if ns is not None else self.not_(s)
        return self.nand(self.nand(a, ns), self.nand(b, s))

    def finish(self, outs: list[int]) -> tuple[bytes, int]:
        """Outputs must be the LAST nOut element signals (TAP-02 §4 step 4): copy each through a
        double inverter so the last records are exactly the outputs, in order."""
        # buffer: out = NAND(NOT o, NOT o) == o; NOT o computed first for every output, then the
        # final NANDs are appended contiguously so they occupy the last nOut indices.
        invs = [self.nand(o, o) for o in outs]
        for v in invs:
            self.nand(v, v)
        data = b"".join(bytes([0]) + a.to_bytes(3, "big") + b.to_bytes(3, "big") for a, b in self.recs)
        return data, len(self.recs)


def strategy_table(c: ref.Circuit) -> int:
    t = 0
    for k in range(64):
        _, out = ref.beat(c, [], [(k >> i) & 1 for i in range(6)])
        t |= out[0] << k
    return t


def build_alld():
    # Always defect: output = NAND(1,1) = 0. One gate; it is the last record, so it is the output.
    data = bytes([0]) + (1).to_bytes(3, "big") + (1).to_bytes(3, "big")
    return data, 1


def build_tft():
    # Tit-for-tat: copy the opponent's last move (in3 = signal 5). Identity needs 2 NANDs.
    b = B(6)
    n = b.nand(5, 5)
    b.nand(n, n)
    return b_bytes(b), len(b.recs)


def build_grim():
    # Grim trigger: cooperate iff I cooperated last round AND the opponent cooperated last round.
    # With cooperate-padded history this is exact grim: the first opponent defection makes me defect,
    # and once I have defected (in0 = 0) I defect forever. in0 = signal 2, in3 = signal 5.
    b = B(6)
    n = b.nand(2, 5)
    b.nand(n, n)
    return b_bytes(b), len(b.recs)


def b_bytes(b: B) -> bytes:
    return b"".join(bytes([0]) + a.to_bytes(3, "big") + c.to_bytes(3, "big") for a, c in b.recs)


def build_lut(table: int):
    """Arbitrary 6-in/1-out function by Shannon expansion (mux tree over in5..in0), with constant
    folding and shared inverters. Used as an upper-bound benchmark for 'any strategy'."""
    b = B(6)
    ns = [b.nand(2 + i, 2 + i) for i in range(6)]
    level = [(table >> k) & 1 for k in range(64)]  # signals 0/1 (constants)
    for var in range(6):
        level = [b.mux(2 + var, level[2 * j], level[2 * j + 1], ns[var]) for j in range(len(level) // 2)]
    out = level[0]
    data, _ = b.finish([out])
    return data, len(b.recs)


def build_argmax(n: int = 8, bits: int = 10):
    """Argmax over n unsigned scores of `bits` bits (score i = inputs i*bits .. i*bits+bits-1, LSB first).
    Outputs the winner's index (3 bits, LSB first). Ties keep the LOWER index (= earlier entry if
    players are indexed by entry order). Tournament: a challenger replaces the leader only if strictly
    greater."""
    b = B(n * bits)
    idx_bits = (n - 1).bit_length()
    score = lambda i: [b.inp(i * bits + k) for k in range(bits)]

    def gt(x, y):  # x > y, ripple from MSB
        g, eq = 0, 1
        for k in reversed(range(bits)):
            xk, yk = x[k], y[k]
            nyk = b.not_(yk)
            nxk = b.not_(xk)
            this_gt = b.and_(xk, nyk)
            g = b.or_(g, b.and_(eq, this_gt))
            if k:
                xnor = b.or_(b.and_(xk, yk), b.and_(nxk, nyk))
                eq = b.and_(eq, xnor)
        return g

    best = score(0)
    best_idx = [0] * idx_bits
    for i in range(1, n):
        s = score(i)
        c = gt(s, best)
        nc = b.not_(c)
        best = [b.mux(c, best[k], s[k], nc) for k in range(bits)]
        ib = [(i >> k) & 1 for k in range(idx_bits)]
        best_idx = [b.mux(c, best_idx[k], ib[k], nc) for k in range(idx_bits)]
    data, _ = b.finish(best_idx)
    return data, len(b.recs)


def check_strategy(name, data, expect_fn):
    c = ref.load(data, 6, 1)
    t = strategy_table(c)
    want = 0
    for k in range(64):
        bits = [(k >> i) & 1 for i in range(6)]
        want |= expect_fn(bits) << k
    assert t == want, (name, hex(t), hex(want))
    return c, t


def main():
    out = {}
    specs = {
        "ALLD": (build_alld, lambda x: 0),
        "TFT": (build_tft, lambda x: x[3]),
        "GRIM": (build_grim, lambda x: x[0] & x[3]),
    }
    for name, (fn, exp) in specs.items():
        data, gates = fn()
        c, t = check_strategy(name, data, exp)
        assert c.n_gates == gates
        out[name] = {"hex": data.hex(), "nIn": 6, "nOut": 1, "gates": gates, "table": f"0x{t:016x}"}

    rng = random.Random(20261119)
    lut_table = rng.getrandbits(64)
    data, gates = build_lut(lut_table)
    c, t = check_strategy("LUT", data, lambda x: (lut_table >> sum(v << i for i, v in enumerate(x))) & 1)
    out["LUT_RANDOM"] = {"hex": data.hex(), "nIn": 6, "nOut": 1, "gates": gates, "table": f"0x{t:016x}"}

    data, gates = build_argmax(8, 10)
    c = ref.load(data, 80, 3)
    vecs = []
    for trial in range(300):
        if trial < 100:  # forced ties
            base = rng.getrandbits(10)
            scores = [base if rng.random() < 0.5 else rng.getrandbits(10) for _ in range(8)]
        else:
            scores = [rng.getrandbits(10) for _ in range(8)]
        bitsv = [(scores[i] >> k) & 1 for i in range(8) for k in range(10)]
        _, o = ref.beat(c, [], bitsv)
        got = o[0] | o[1] << 1 | o[2] << 2
        want = max(range(8), key=lambda i: (scores[i], -i))
        assert got == want, (scores, got, want)
        if trial < 6:
            vecs.append({"scores": scores, "winner": want, "inputs": ref.pack(bitsv).hex()})
    out["ARGMAX8x10"] = {"hex": data.hex(), "nIn": 80, "nOut": 3, "gates": gates, "vectors": vecs}

    (HERE / "out").mkdir(exist_ok=True)
    (HERE / "out" / "netlists.json").write_text(json.dumps(out, indent=1))

    sol = ["// SPDX-License-Identifier: MIT", "// Generated by phase0/netlists/gen.py - do not edit.",
           "pragma solidity ^0.8.24;", "", "library Netlists {"]
    for name, v in out.items():
        sol.append(f"    bytes internal constant {name} = hex\"{v['hex']}\";")
        sol.append(f"    uint32 internal constant {name}_GATES = {v['gates']};")
        if "table" in v:
            sol.append(f"    uint64 internal constant {name}_TABLE = {v['table']};")
    am = out["ARGMAX8x10"]["vectors"]
    for i, v in enumerate(am):
        sol.append(f"    bytes internal constant ARGMAX_IN{i} = hex\"{v['inputs']}\";")
        sol.append(f"    uint8 internal constant ARGMAX_WIN{i} = {v['winner']};")
    sol.append("}")
    (HERE.parent / "test").mkdir(exist_ok=True)
    (HERE.parent / "test" / "Netlists.sol").write_text("\n".join(sol) + "\n")
    for k, v in out.items():
        print(f"{k:12} nIn={v['nIn']:3} nOut={v['nOut']} gates={v['gates']:5} bytes={len(v['hex'])//2}"
              + (f" table={v['table']}" if 'table' in v else ""))


if __name__ == "__main__":
    main()
