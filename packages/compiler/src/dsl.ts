/**
 * Strategy rule DSL -> 64-entry table.
 *
 * One rule per line (or separated by ';'); the first rule whose condition holds decides the move.
 *   cooperate if opp_last == C
 *   defect if opp_defects_in_last3 >= 2
 *   default cooperate            (optional; if no rule matches and no default: cooperate)
 *
 * Move values: C / D (also cooperate / defect).
 * Move variables:  my_last my_last2 my_last3  opp_last opp_last2 opp_last3   (t-1, t-2, t-3)
 * Count variables: my_defects_in_last3 my_coops_in_last3 opp_defects_in_last3 opp_coops_in_last3
 *                  (also *_in_last2 over t-1,t-2)
 * Operators: == != >= <= > <   and or not   ( )   true false
 * Remember: before round 1 the whole history reads as C (cooperate).
 */

type Env = Record<string, number>;
type Node = (e: Env) => number;

const MOVE_VARS: Record<string, [side: "my" | "opp", lag: number]> = {
  my_last: ["my", 0],
  my_last2: ["my", 1],
  my_last3: ["my", 2],
  opp_last: ["opp", 0],
  opp_last2: ["opp", 1],
  opp_last3: ["opp", 2],
};

export function envOf(k: number): Env {
  const my = [k & 1, (k >> 1) & 1, (k >> 2) & 1];
  const opp = [(k >> 3) & 1, (k >> 4) & 1, (k >> 5) & 1];
  const e: Env = {};
  for (const [name, [side, lag]] of Object.entries(MOVE_VARS)) e[name] = (side === "my" ? my : opp)[lag];
  for (const [side, arr] of [["my", my], ["opp", opp]] as const) {
    for (const n of [2, 3]) {
      const c = arr.slice(0, n).reduce((s, x) => s + x, 0);
      e[`${side}_coops_in_last${n}`] = c;
      e[`${side}_defects_in_last${n}`] = n - c;
    }
  }
  return e;
}

function tokenize(src: string): string[] {
  const re = /\s*(==|!=|>=|<=|[()<>]|[A-Za-z_][A-Za-z0-9_]*|\d+)\s*/y;
  const out: string[] = [];
  let i = 0;
  while (i < src.length) {
    re.lastIndex = i;
    const m = re.exec(src);
    if (!m) throw new Error(`DSL: unexpected character at "${src.slice(i, i + 12)}"`);
    if (m[1]) out.push(m[1]);
    i = re.lastIndex;
  }
  return out;
}

function parseExpr(tokens: string[]): Node {
  let p = 0;
  const peek = () => tokens[p];
  const eat = (t?: string) => {
    const x = tokens[p++];
    if (t && x?.toLowerCase() !== t) throw new Error(`DSL: expected "${t}", got "${x ?? "end"}"`);
    return x;
  };
  const atom = (): Node => {
    const t = eat();
    if (t === undefined) throw new Error("DSL: unexpected end of condition");
    const l = t.toLowerCase();
    if (l === "(") {
      const n = or();
      eat(")");
      return n;
    }
    if (l === "not") {
      const n = cmp();
      return (e) => (n(e) ? 0 : 1);
    }
    if (l === "true") return () => 1;
    if (l === "false") return () => 0;
    if (l === "c" || l === "cooperate") return () => 1;
    if (l === "d" || l === "defect") return () => 0;
    if (/^\d+$/.test(l)) {
      const v = Number(l);
      return () => v;
    }
    const valid = Object.keys(envOf(0));
    if (!valid.includes(l)) throw new Error(`DSL: unknown variable "${t}". Use one of: ${valid.join(", ")}`);
    return (e) => e[l];
  };
  const cmp = (): Node => {
    const a = atom();
    const op = peek();
    if (op && ["==", "!=", ">=", "<=", ">", "<"].includes(op)) {
      eat();
      const b = atom();
      switch (op) {
        case "==": return (e) => +(a(e) === b(e));
        case "!=": return (e) => +(a(e) !== b(e));
        case ">=": return (e) => +(a(e) >= b(e));
        case "<=": return (e) => +(a(e) <= b(e));
        case ">": return (e) => +(a(e) > b(e));
        default: return (e) => +(a(e) < b(e));
      }
    }
    return a;
  };
  const and = (): Node => {
    let n = cmp();
    while (peek()?.toLowerCase() === "and") {
      eat();
      const r = cmp();
      const l = n;
      n = (e) => +(!!l(e) && !!r(e));
    }
    return n;
  };
  const or = (): Node => {
    let n = and();
    while (peek()?.toLowerCase() === "or") {
      eat();
      const r = and();
      const l = n;
      n = (e) => +(!!l(e) || !!r(e));
    }
    return n;
  };
  const n = or();
  if (p !== tokens.length) throw new Error(`DSL: unexpected "${tokens[p]}"`);
  return n;
}

/** Compile DSL source to a 64-entry table. */
export function dslToTable(src: string): bigint {
  const rules: { move: number; cond: Node }[] = [];
  let dflt = 1;
  for (const raw of src.split(/[\n;]+/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const m = /^(cooperate|defect|c|d)\s*(?:if\s+(.+))?$/i.exec(line) ?? /^default\s+(cooperate|defect|c|d)$/i.exec(line);
    if (!m) throw new Error(`DSL: cannot parse rule "${line}" (expected "cooperate|defect if <condition>" or "default cooperate|defect")`);
    const move = /^c/i.test(m[1]) ? 1 : 0;
    if (/^default/i.test(line) || m[2] === undefined) {
      dflt = move;
      continue;
    }
    rules.push({ move, cond: parseExpr(tokenize(m[2])) });
  }
  let t = 0n;
  for (let k = 0; k < 64; k++) {
    const e = envOf(k);
    const r = rules.find((x) => x.cond(e));
    if ((r ? r.move : dflt) === 1) t |= 1n << BigInt(k);
  }
  return t;
}
