import { decode, encode, fromHex, Gate, MAX_GATES, tableOf, toHex } from "./netlist.js";
import { synthesize } from "./synth.js";
import { dslToTable } from "./dsl.js";

export * from "./netlist.js";
export * from "./synth.js";
export * from "./dsl.js";
export * from "./duel.js";

export type Compiled = {
  table: bigint;
  tableHex: `0x${string}`;
  netlist: `0x${string}`;
  gates: number;
  method: string;
  fitsRegistry: boolean; // gates <= MAX_GATES (88)
};

export function tableHex(t: bigint): `0x${string}` {
  return `0x${t.toString(16).padStart(16, "0")}`;
}

/** Compile a table (bigint / 0x hex string) or DSL source to a verified netlist. */
export function compile(input: bigint | string): Compiled {
  let table: bigint;
  if (typeof input === "bigint") table = input;
  else if (/^\s*0x[0-9a-fA-F]{1,16}\s*$/.test(input)) table = BigInt(input.trim());
  else table = dslToTable(input);
  const { gates, method } = synthesize(table);
  if (tableOf(gates) !== table) throw new Error("compiled netlist does not reproduce the table");
  return {
    table,
    tableHex: tableHex(table),
    netlist: toHex(encode(gates)),
    gates: gates.length,
    method,
    fitsRegistry: gates.length <= MAX_GATES,
  };
}

/** Table and gates of an existing netlist (hex), validated the way the Registry does. */
export function inspect(netlistHex: string): { gates: Gate[]; table: bigint } {
  const gates = decode(fromHex(netlistHex));
  return { gates, table: tableOf(gates) };
}
