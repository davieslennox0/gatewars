import { decodeEventLog, encodeFunctionData, formatEther, formatUnits, type Address, type Hex } from "viem";
import { compile, inspect, play, tableHex, vsStarters, MAX_GATES } from "@gatewars/compiler";
import { ADDR, ASSETS, RISK, STARTER_IDS, STATES, TIERS, agentIdAbi, arenaAbi, client, erc20Abi, registryAbi } from "./chain.js";
import { execute, preview, requireDevMode, walletAddress } from "./wallet.js";

const out = (s = "") => process.stdout.write(s + "\n");

function tierOf(s?: string): number {
  const i = TIERS.indexOf((s ?? "").toUpperCase() as (typeof TIERS)[number]);
  if (i < 0) throw new Error(`tier must be one of ${TIERS.join(", ").toLowerCase()}`);
  return i;
}
function assetOf(s?: string): number {
  const i = ASSETS.indexOf((s ?? "bnb").toUpperCase() as (typeof ASSETS)[number]);
  if (i < 0) throw new Error("asset must be bnb or usdc");
  return i;
}
const usd8 = (x: bigint) => `$${(Number(x) / 1e8).toFixed(2)}`;
const bnb = (x: bigint) => `${formatEther(x)} BNB`;
const usdc = (x: bigint) => `${formatUnits(x, 18)} USDC`;

async function quote(tier: number) {
  const [[bnbWei, usdcAmt], usd] = await Promise.all([
    client.readContract({ address: ADDR.arena, abi: arenaAbi, functionName: "quoteEntry", args: [tier] }),
    client.readContract({ address: ADDR.arena, abi: arenaAbi, functionName: "tierFeeUsd", args: [BigInt(tier)] }),
  ]);
  return { bnbWei, usdcAmt, usd };
}

async function handle(a: Address) {
  try {
    const h = await client.readContract({ address: ADDR.agentId, abi: agentIdAbi, functionName: "handleOf", args: [a] });
    return h ? `${h}.ai` : a;
  } catch {
    return a;
  }
}

async function requireAgent(me: Address) {
  const n = await client.readContract({ address: ADDR.agentId, abi: agentIdAbi, functionName: "balanceOf", args: [me] });
  if (n === 0n) throw new Error("This wallet holds no Agent ID; GateWars requires one for every player action.");
}

async function game(id: bigint) {
  return client.readContract({ address: ADDR.arena, abi: arenaAbi, functionName: "game", args: [id] });
}

// ---------------------------------------------------------------- commands

async function status() {
  const me = walletAddress();
  out(`wallet ${me} (${await handle(me)})`);
  for (const t of [0, 1]) {
    const id = await client.readContract({ address: ADDR.arena, abi: arenaAbi, functionName: "openBracket", args: [t] });
    const q = await quote(t);
    if (id === 0n) {
      out(`${TIERS[t]}: no open bracket (entering opens one). Entry ≈ ${bnb(q.bnbWei)} or ${usdc(q.usdcAmt)}`);
      continue;
    }
    const g = await game(id);
    out(
      `${TIERS[t]} #${id}: ${g.players.length}/${g.size} filled, ${g.size - g.players.length} slots left, pool ${bnb(g.poolBnb)} + ${usdc(g.poolUsdc)} ≈ ${usd8(g.poolUsd)}, expires ${new Date(Number(g.expiresAt) * 1000).toISOString()}`,
    );
    out(`   entrants: ${(await Promise.all(g.players.map(handle))).join(", ") || "-"}; entry ≈ ${bnb(q.bnbWei)} or ${usdc(q.usdcAmt)}`);
  }
  const ch = await client.readContract({ address: ADDR.arena, abi: arenaAbi, functionName: "openChallenges" });
  out(`CHAMPION: ${ch.length} open challenge(s)${ch.length ? `: ${ch.join(", ")}` : ""}`);
  const r = await client.readContract({ address: ADDR.arena, abi: arenaAbi, functionName: "record", args: [me] });
  out(
    `my record: ${r.matchesPlayed} matches, ${r.wins}W ${r.losses}L ${r.draws}D; rookie wins ${r.rookieWins}, pro wins ${r.proWins}, champion wins ${r.championWins}`,
  );
  out(`unlocked: ROOKIE${r.rookieWins >= 1 ? ", PRO" : ""}${r.proWins >= 3 ? ", CHAMPION" : ""}`);
  const [cb, cu] = await Promise.all([
    client.readContract({ address: ADDR.arena, abi: arenaAbi, functionName: "claimableBnb", args: [me] }),
    client.readContract({ address: ADDR.arena, abi: arenaAbi, functionName: "claimableUsdc", args: [me] }),
  ]);
  out(`claimable: ${bnb(cb)} + ${usdc(cu)}`);
  const mine = await client.readContract({ address: ADDR.registry, abi: registryAbi, functionName: "circuitsOf", args: [me] });
  out(`my circuits: ${mine.length ? mine.join(", ") : "none"}; starters: TFT=1 GRIM=2 ALWAYS_DEFECT=3`);
}

/** Recent winning circuits, read from chain (no indexer needed). */
async function recentWinners(limit = 20) {
  const next = await client.readContract({ address: ADDR.arena, abi: arenaAbi, functionName: "nextGameId" });
  const res: { game: bigint; tier: string; winner: string; circuitId: bigint; table: bigint }[] = [];
  for (let id = next - 1n; id >= 1n && res.length < limit; id--) {
    const g = await game(id);
    if (STATES[g.state] !== "SETTLED" || g.winner === "0x0000000000000000000000000000000000000000") continue;
    const i = g.players.findIndex((p) => p.toLowerCase() === g.winner.toLowerCase());
    const cid = g.circuits[i];
    const table = await client.readContract({ address: ADDR.registry, abi: registryAbi, functionName: "tableOf", args: [cid] });
    res.push({ game: id, tier: TIERS[g.tier], winner: await handle(g.winner), circuitId: cid, table });
  }
  return res;
}

async function designContext() {
  out("Input encoding: bit0..2 = my moves t-1..t-3, bit3..5 = opponent moves t-1..t-3; 1 = cooperate; history starts all-cooperate.");
  out("Payoffs CC 3/3, DC 5/0, CD 0/5, DD 1/1; 20 rounds; round robin; tie-break total -> head-to-head -> earliest entry.");
  out(`Max ${MAX_GATES} gates. DSL variables: my_last my_last2 my_last3 opp_last opp_last2 opp_last3, (my|opp)_(defects|coops)_in_last(2|3).`);
  out("Starters: TFT 0xff00ff00ff00ff00, GRIM 0xaa00aa00aa00aa00, ALWAYS_DEFECT 0x0000000000000000");
  const w = await recentWinners();
  out(w.length ? "Recent winners:" : "No settled games yet.");
  for (const x of w) out(`  game ${x.game} ${x.tier}: ${x.winner} circuit ${x.circuitId} table ${tableHex(x.table)}`);
}

async function simulate(src: string) {
  const c = /^0x[0-9a-fA-F]{17,}$/.test(src) && src.length > 18 ? null : compile(src);
  const table = c ? c.table : inspect(src).table;
  out(`table ${tableHex(table)}`);
  if (c) out(`netlist ${c.netlist}\ngates ${c.gates} (${c.method}) ${c.fitsRegistry ? "fits" : `TOO BIG (> ${MAX_GATES})`}`);
  else out(`netlist ${src} (given)\ngates ${inspect(src).gates.length}`);
  out("vs starters (you-them, 20 rounds):");
  for (const r of vsStarters(table)) out(`  ${r.opponent.padEnd(14)} ${r.you}-${r.them}`);
  const w = await recentWinners(8).catch(() => []);
  for (const x of w) {
    const r = play(table, x.table);
    out(`  winner ${x.circuitId} (${x.winner}) ${r.scoreA}-${r.scoreB}`);
  }
  return c;
}

async function submit(src: string) {
  const me = walletAddress();
  await requireAgent(me);
  requireDevMode();
  let netlist: Hex;
  let gates: number;
  if (/^0x(00[0-9a-fA-F]{12})+$/.test(src) && src.length > 18) {
    const i = inspect(src);
    netlist = src as Hex;
    gates = i.gates.length;
  } else {
    const c = await simulate(src);
    if (!c) throw new Error("could not compile");
    if (!c.fitsRegistry) throw new Error(`${c.gates} gates > ${MAX_GATES}; simplify the strategy`);
    netlist = c.netlist;
    gates = c.gates;
  }
  if (gates > MAX_GATES) throw new Error(`${gates} gates > ${MAX_GATES}`);
  const fee = await client.readContract({ address: ADDR.registry, abi: registryAbi, functionName: "tapeOutFee", args: [BigInt(gates)] });
  out(`fee (exact): ${bnb(fee)} (TapeOut tape-out fee passthrough${gates ? ` for ${gates} gates` : ""})`);
  const data = encodeFunctionData({ abi: registryAbi, functionName: "submitCircuit", args: [netlist] });
  out(preview(me, ADDR.registry, data, fee, `CircuitRegistry.submitCircuit (${gates} gates)`).summary);
}

async function enter(tierS: string, circuitS?: string, assetS?: string) {
  const tier = tierOf(tierS);
  if (tier === 2) throw new Error("CHAMPION is 1v1: use `challenge create|accept`");
  const circuitId = BigInt(circuitS ?? STARTER_IDS.TIT_FOR_TAT);
  const asset = assetOf(assetS);
  const me = walletAddress();
  await requireAgent(me);
  requireDevMode();
  const q = await quote(tier);
  out(RISK);
  const data = encodeFunctionData({ abi: arenaAbi, functionName: "enter", args: [tier, circuitId, asset] });
  if (asset === 0) {
    const value = (q.bnbWei * 101n) / 100n;
    out(`Entry ≈ ${usd8(q.usd)} (${bnb(q.bnbWei)}), sending ${bnb(value)}; excess refunded in the same transaction.`);
    out(preview(me, ADDR.arena, data, value, `Arena.enter(${TIERS[tier]}, circuit ${circuitId}, BNB)`).summary);
  } else {
    await usdcStep(me, q.usdcAmt, data, `Arena.enter(${TIERS[tier]}, circuit ${circuitId}, USDC)`);
  }
}

/** USDC path: exact approval first (if needed), then the action. Never approves more than `amount`. */
async function usdcStep(me: Address, amount: bigint, data: Hex, label: string) {
  out(`Entry: exactly ${usdc(amount)} (no oracle, no excess).`);
  const allowance = await client.readContract({ address: ADDR.usdc, abi: erc20Abi, functionName: "allowance", args: [me, ADDR.arena] });
  if (allowance < amount) {
    const ap = encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [ADDR.arena, amount] });
    out("Step 1 of 2: exact USDC approval (amount = entry fee only, never unlimited).");
    out(preview(me, ADDR.usdc, ap, 0n, `USDC.approve(Arena, ${usdc(amount)})`).summary);
    out("After it is executed, run the same command again for step 2.");
    return;
  }
  out(preview(me, ADDR.arena, data, 0n, label).summary);
}

async function challenge(sub: string, a?: string, b?: string, c?: string) {
  if (sub === "list") {
    const ids = await client.readContract({ address: ADDR.arena, abi: arenaAbi, functionName: "openChallenges" });
    if (!ids.length) return out("No open challenges.");
    for (const id of ids) {
      const g = await game(id);
      out(`challenge ${id}: by ${await handle(g.players[0])} circuit ${g.circuits[0]}, pool ${bnb(g.poolBnb)} + ${usdc(g.poolUsdc)} ≈ ${usd8(g.poolUsd)}, expires ${new Date(Number(g.expiresAt) * 1000).toISOString()}`);
    }
    return;
  }
  const me = walletAddress();
  await requireAgent(me);
  requireDevMode();
  const q = await quote(2);
  out(RISK);
  let data: Hex;
  let asset: number;
  let label: string;
  if (sub === "create") {
    const cid = BigInt(a ?? STARTER_IDS.TIT_FOR_TAT);
    asset = assetOf(b);
    data = encodeFunctionData({ abi: arenaAbi, functionName: "createChallenge", args: [cid, asset] });
    label = `Arena.createChallenge(circuit ${cid}, ${ASSETS[asset]})`;
  } else if (sub === "accept") {
    if (!a) throw new Error("usage: challenge accept <challengeId> [circuitId] [bnb|usdc]");
    const cid = BigInt(b ?? STARTER_IDS.TIT_FOR_TAT);
    asset = assetOf(c);
    data = encodeFunctionData({ abi: arenaAbi, functionName: "acceptChallenge", args: [BigInt(a), cid, asset] });
    label = `Arena.acceptChallenge(${a}, circuit ${cid}, ${ASSETS[asset]})`;
  } else throw new Error("usage: challenge create|accept|list");
  if (asset === 0) {
    const value = (q.bnbWei * 101n) / 100n;
    out(`Entry ≈ ${usd8(q.usd)} (${bnb(q.bnbWei)}), sending ${bnb(value)}; excess refunded in the same transaction.`);
    out(preview(me, ADDR.arena, data, value, label).summary);
  } else await usdcStep(me, q.usdcAmt, data, label);
}

async function simple(fn: "settle" | "expire" | "claimRefund" | "claim", id?: string) {
  const me = walletAddress();
  if (fn === "claim" || fn === "claimRefund") await requireAgent(me);
  requireDevMode();
  const args = fn === "claim" ? [] : [BigInt(id ?? "0")];
  if (fn !== "claim" && !id) throw new Error(`usage: ${fn === "claimRefund" ? "refund" : fn} <id>`);
  const data = encodeFunctionData({ abi: arenaAbi, functionName: fn, args: args as any });
  out(preview(me, ADDR.arena, data, 0n, `Arena.${fn}(${args.join(",")})`).summary);
}

async function exec(requestId?: string) {
  if (!requestId) throw new Error("usage: exec <requestId>  (only after the user confirmed the preview)");
  const r = execute(requestId);
  out(`status ${r.status}${r.txHash ? ` tx ${r.txHash}` : ""}`);
  if (r.status !== "BROADCASTED" || !r.txHash) {
    out("Not broadcast (e.g. PENDING_CONFIRMATION in the Binance App, or blocked). Stop and tell the user.");
    return;
  }
  const rc = await client.waitForTransactionReceipt({ hash: r.txHash, timeout: 120_000 });
  out(`receipt: ${rc.status} block ${rc.blockNumber} gasUsed ${rc.gasUsed}`);
  for (const log of rc.logs) {
    for (const abi of [arenaAbi, registryAbi]) {
      try {
        const ev = decodeEventLog({ abi, data: log.data, topics: log.topics }) as { eventName: string; args: Record<string, unknown> };
        out(`  ${ev.eventName} ${JSON.stringify(ev.args, (_, v) => (typeof v === "bigint" ? v.toString() : v))}`);
        break;
      } catch {
        /* not this abi */
      }
    }
  }
}

const HELP = `gatewars <command>
  status                                  open brackets, pools, my record / claimable / unlocked tiers
  design-context                          rules + recent winning circuits (for the LLM to design from)
  simulate "<dsl>|0x<table>|0x<netlist>"  compile, gate count, scores vs starters and recent winners
  submit "<dsl>|0x<table>|0x<netlist>"    preview CircuitRegistry.submitCircuit with the exact fee
  enter <rookie|pro> [circuitId=1] [bnb|usdc]
  challenge create [circuitId] [bnb|usdc] | accept <id> [circuitId] [bnb|usdc] | list
  settle <id> | expire <id> | claim | refund <id>
  exec <requestId>                        execute a preview the user has explicitly confirmed`;

async function main() {
  const [cmd, ...a] = process.argv.slice(2);
  switch (cmd) {
    case "status": return status();
    case "design-context": return designContext();
    case "simulate": return void (await simulate(a.join(" ")));
    case "submit": return submit(a.join(" "));
    case "enter": return enter(a[0], a[1], a[2]);
    case "challenge": return challenge(a[0], a[1], a[2], a[3]);
    case "settle": return simple("settle", a[0]);
    case "expire": return simple("expire", a[0]);
    case "claim": return simple("claim");
    case "refund": return simple("claimRefund", a[0]);
    case "exec": return exec(a[0]);
    default: out(HELP);
  }
}

main().catch((e) => {
  process.stderr.write(`error: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
