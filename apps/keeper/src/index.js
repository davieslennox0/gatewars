// GateWars indexer + JSON API + keeper.
//  - Indexer: polls Arena/Registry logs (archive RPC) into SQLite.
//  - API (read-only JSON, CORS for the website): /health /brackets /bracket/:id /leaderboard /circuits /challenges
//  - Keeper: settle(id) for FULL brackets, expire(id) for OPEN games past 24h, from a dust hot wallet.
//    It only ever calls settle/expire (callable by anyone). It never touches owner functions.
import { createServer } from "node:http";
import { readFileSync, existsSync, appendFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { createPublicClient, createWalletClient, http, parseAbi, decodeEventLog } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bsc } from "viem/chains";

// ---------------------------------------------------------------- config: ONLY apps/keeper/.env (never the repo-root .env, which holds the owner key)
for (const p of [new URL("../.env", import.meta.url)]) {
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}
const E = process.env;
const ARENA = "0x46D2Ac21CD838F5eaBae7bcBa753405D5E32660C";
const REGISTRY = "0x93280c16C56ff2e2A2Fc344Db868Fabea9aeC2c9";
const PROCESSOR = "0xDaC12492090F0937B6aAAd3De13E39114f18dA65";
const AGENT_ID = "0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F";
const START_BLOCK = BigInt(E.START_BLOCK ?? "134479030");
const CHUNK = 1000n; // thirdweb public RPC: max 1000 blocks per getLogs
const POLL_MS = 15_000;
const KEEPER_MS = 30_000;
const LOG = new URL("../keeper.log", import.meta.url);

const arenaAbi = parseAbi([
  "event GameOpened(uint256 indexed id, uint8 tier, address indexed creator)",
  "event Entered(uint256 indexed id, address indexed player, uint256 circuitId, uint8 slot, string handle)",
  "event EntryPaid(uint256 indexed id, address indexed player, uint8 asset, uint256 amount, uint256 priceUsed, uint256 excess)",
  "event GameFull(uint256 indexed id)",
  "event MatchPlayed(uint256 indexed id, address indexed a, address indexed b, uint16 scoreA, uint16 scoreB, uint40 movesA, uint40 movesB)",
  "event Settled(uint256 indexed id, address indexed winner, uint256 poolBnb, uint256 poolUsdc)",
  "event Expired(uint256 indexed id)",
  "event Refunded(uint256 indexed id, address indexed player, uint8 asset, uint256 amount)",
  "event Claimed(address indexed player, uint256 bnbAmount, uint256 usdcAmount)",
  "function game(uint256 id) view returns ((uint256 id, uint8 tier, uint8 state, uint8 size, uint40 openedAt, uint40 expiresAt, address winner, address[] players, uint256[] circuits, string[] handles, uint8[] assets, uint256[] paid, uint256 poolBnb, uint256 poolUsdc, uint256 poolUsd))",
  "function nextGameId() view returns (uint256)",
  "function openBracket(uint8 tier) view returns (uint256)",
  "function openChallenges() view returns (uint256[])",
  "function quoteEntry(uint8 tier) view returns (uint256, uint256)",
  "function tierFeeUsd(uint256) view returns (uint256)",
  "function settle(uint256 id)",
  "function expire(uint256 id)",
]);
const registryAbi = parseAbi([
  "event CircuitSubmitted(uint256 indexed circuitId, address indexed owner, string handle, uint32 gateCount, uint64 table)",
]);
const processorAbi = parseAbi(["function netlist(uint256 id) view returns (bytes)"]);
const agentAbi = parseAbi(["function handleOf(address) view returns (string)"]);
const TIERS = ["ROOKIE", "PRO", "CHAMPION"];
const STATES = ["NONE", "OPEN", "FULL", "SETTLED", "EXPIRED"];

const indexClient = createPublicClient({ chain: bsc, transport: http(E.INDEX_RPC_URL ?? "https://56.rpc.thirdweb.com") });
const client = createPublicClient({ chain: bsc, transport: http(E.TX_RPC_URL ?? "https://bsc-dataseed.bnbchain.org") });

// ---------------------------------------------------------------- db
const db = new DatabaseSync(E.DB_PATH ? new URL(E.DB_PATH, new URL("../", import.meta.url)).pathname : new URL("../gatewars.sqlite", import.meta.url).pathname);
db.exec(`
  PRAGMA journal_mode=WAL;
  CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
  CREATE TABLE IF NOT EXISTS events (block INTEGER, logi INTEGER, tx TEXT, addr TEXT, name TEXT, game INTEGER, args TEXT, PRIMARY KEY (tx, logi));
  CREATE INDEX IF NOT EXISTS ev_name ON events(name);
  CREATE INDEX IF NOT EXISTS ev_game ON events(game);
  CREATE TABLE IF NOT EXISTS handles (addr TEXT PRIMARY KEY, handle TEXT, at INTEGER);
  CREATE TABLE IF NOT EXISTS netlists (id INTEGER PRIMARY KEY, hex TEXT);
  CREATE TABLE IF NOT EXISTS keeper_tx (at INTEGER, game INTEGER, action TEXT, tx TEXT, status TEXT, error TEXT);
`);
const getMeta = (k) => db.prepare("SELECT v FROM meta WHERE k=?").get(k)?.v;
const setMeta = (k, v) => db.prepare("INSERT INTO meta(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").run(k, String(v));
const json = (o) => JSON.stringify(o, (_, v) => (typeof v === "bigint" ? v.toString() : v));
const log = (...a) => {
  const line = `${new Date().toISOString()} ${a.join(" ")}`;
  console.log(line);
  appendFileSync(LOG, line + "\n");
};

// ---------------------------------------------------------------- indexer
async function indexOnce() {
  const head = (await indexClient.getBlockNumber()) - 2n;
  let from = BigInt(getMeta("lastBlock") ?? START_BLOCK - 1n) + 1n;
  const ins = db.prepare("INSERT OR IGNORE INTO events VALUES (?,?,?,?,?,?,?)");
  while (from <= head) {
    const to = from + CHUNK - 1n > head ? head : from + CHUNK - 1n;
    const logs = await indexClient.getLogs({ address: [ARENA, REGISTRY], fromBlock: from, toBlock: to });
    for (const l of logs) {
      const abi = l.address.toLowerCase() === ARENA.toLowerCase() ? arenaAbi : registryAbi;
      try {
        const ev = decodeEventLog({ abi, data: l.data, topics: l.topics });
        const game = ev.args.id ?? null;
        ins.run(Number(l.blockNumber), l.logIndex, l.transactionHash, l.address.toLowerCase(), ev.eventName, game === null ? null : Number(game), json(ev.args));
      } catch {
        /* unknown event (e.g. Ownable) */
      }
    }
    setMeta("lastBlock", to);
    from = to + 1n;
  }
}

// ---------------------------------------------------------------- chain reads (cached)
const cache = new Map();
async function cached(key, ttlMs, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.v;
  const v = await fn();
  cache.set(key, { at: Date.now(), v });
  return v;
}
async function handleOf(addr) {
  const a = addr.toLowerCase();
  const row = db.prepare("SELECT handle, at FROM handles WHERE addr=?").get(a);
  if (row && Date.now() - row.at < 6 * 3600_000) return row.handle;
  let h = "";
  try {
    h = await client.readContract({ address: AGENT_ID, abi: agentAbi, functionName: "handleOf", args: [addr] });
  } catch {}
  db.prepare("INSERT INTO handles VALUES(?,?,?) ON CONFLICT(addr) DO UPDATE SET handle=excluded.handle, at=excluded.at").run(a, h, Date.now());
  return h;
}
const readGame = (id) => cached(`game:${id}`, 10_000, () => client.readContract({ address: ARENA, abi: arenaAbi, functionName: "game", args: [BigInt(id)] }));
const view = (g) => ({
  id: Number(g.id),
  tier: TIERS[g.tier],
  state: STATES[g.state],
  size: g.size,
  openedAt: Number(g.openedAt),
  expiresAt: Number(g.expiresAt),
  winner: g.winner,
  players: g.players.map((p, i) => ({ address: p, handle: g.handles[i], circuitId: Number(g.circuits[i]), asset: ["BNB", "USDC"][g.assets[i]], paid: g.paid[i] })),
  poolBnb: g.poolBnb,
  poolUsdc: g.poolUsdc,
  poolUsd: Number(g.poolUsd) / 1e8,
});
async function netlistOf(id) {
  const row = db.prepare("SELECT hex FROM netlists WHERE id=?").get(id);
  if (row) return row.hex;
  const hex = await client.readContract({ address: PROCESSOR, abi: processorAbi, functionName: "netlist", args: [BigInt(id)] });
  db.prepare("INSERT OR REPLACE INTO netlists VALUES(?,?)").run(id, hex);
  return hex;
}
const evs = (sql, ...p) => db.prepare(sql).all(...p).map((r) => ({ ...r, args: JSON.parse(r.args) }));

// ---------------------------------------------------------------- API
async function route(path) {
  if (path === "/stats") {
    const last = db.prepare("SELECT block FROM events WHERE name='MatchPlayed' ORDER BY block DESC, logi DESC LIMIT 1").get();
    let lastMatchTime = null;
    if (last) lastMatchTime = await cached(`blk:${last.block}`, 3600_000, async () => Number((await client.getBlock({ blockNumber: BigInt(last.block) })).timestamp));
    const next = Number(await cached("next", 10_000, () => client.readContract({ address: ARENA, abi: arenaAbi, functionName: "nextGameId" })));
    let livePoolsUsd = 0;
    const agents = new Set();
    for (let id = 1; id < next; id++) {
      const g = await readGame(id);
      if (g.state === 1 || g.state === 2) livePoolsUsd += Number(g.poolUsd) / 1e8;
      g.players.forEach((p) => agents.add(p.toLowerCase()));
    }
    return { games: next - 1, agents: agents.size, livePoolsUsd, lastMatchBlock: last?.block ?? null, lastMatchTime };
  }
  if (path === "/health") return { ok: true, lastBlock: Number(getMeta("lastBlock") ?? 0), keeper: E.KEEPER_ENABLED === "1" };
  if (path === "/brackets") {
    const [r, p, next] = await Promise.all([0, 1].map((t) => cached(`open:${t}`, 10_000, () => client.readContract({ address: ARENA, abi: arenaAbi, functionName: "openBracket", args: [t] }))).concat([cached("next", 10_000, () => client.readContract({ address: ARENA, abi: arenaAbi, functionName: "nextGameId" }))]));
    const quotes = await cached("quotes", 15_000, async () =>
      Promise.all([0, 1, 2].map(async (t) => {
        const [bnbWei, usdc] = await client.readContract({ address: ARENA, abi: arenaAbi, functionName: "quoteEntry", args: [t] });
        const usd = await client.readContract({ address: ARENA, abi: arenaAbi, functionName: "tierFeeUsd", args: [BigInt(t)] });
        return { tier: TIERS[t], usd: Number(usd) / 1e8, bnbWei, usdc };
      })),
    );
    const recent = [];
    for (let id = Number(next) - 1; id >= 1 && recent.length < 20; id--) recent.push(view(await readGame(id)));
    return { open: { ROOKIE: r ? view(await readGame(r)) : null, PRO: p ? view(await readGame(p)) : null }, quotes, recent };
  }
  let m = /^\/bracket\/(\d+)$/.exec(path);
  if (m) {
    const id = Number(m[1]);
    const g = view(await readGame(id));
    const matches = evs("SELECT block, tx, args FROM events WHERE name='MatchPlayed' AND game=? ORDER BY block, logi", id).map((e) => ({ ...e.args, tx: e.tx }));
    const totals = {};
    for (const x of matches) {
      totals[x.a] = (totals[x.a] ?? 0) + Number(x.scoreA);
      totals[x.b] = (totals[x.b] ?? 0) + Number(x.scoreB);
    }
    const tables = {};
    for (const s of evs("SELECT args FROM events WHERE name='CircuitSubmitted'")) tables[s.args.circuitId] = s.args.table;
    return { ...g, matches, standings: g.players.map((p) => ({ ...p, score: totals[p.address] ?? null, table: tables[p.circuitId] ?? null })) };
  }
  if (path === "/leaderboard") {
    const rows = {};
    const get = (a) => (rows[a.toLowerCase()] ??= { address: a, matches: 0, wins: 0, losses: 0, draws: 0, rookieWins: 0, proWins: 0, championWins: 0 });
    for (const e of evs("SELECT args FROM events WHERE name='MatchPlayed'")) {
      const { a, b, scoreA, scoreB } = e.args;
      const A = get(a), B = get(b);
      A.matches++; B.matches++;
      if (+scoreA > +scoreB) { A.wins++; B.losses++; } else if (+scoreB > +scoreA) { B.wins++; A.losses++; } else { A.draws++; B.draws++; }
    }
    for (const e of evs("SELECT game, args FROM events WHERE name='Settled'")) {
      if (/^0x0+$/.test(e.args.winner)) continue;
      const g = await readGame(e.game);
      const k = ["rookieWins", "proWins", "championWins"][g.tier];
      get(e.args.winner)[k]++;
    }
    const list = Object.values(rows);
    for (const r of list) r.handle = await handleOf(r.address);
    list.sort((x, y) => y.championWins - x.championWins || y.proWins - x.proWins || y.rookieWins - x.rookieWins || y.wins - x.wins || x.losses - y.losses);
    return { players: list };
  }
  if (path === "/circuits") {
    const winners = {};
    for (const e of evs("SELECT game, args FROM events WHERE name='Settled'")) {
      if (/^0x0+$/.test(e.args.winner)) continue;
      const g = await readGame(e.game);
      const i = g.players.findIndex((p) => p.toLowerCase() === e.args.winner.toLowerCase());
      const cid = Number(g.circuits[i]);
      (winners[cid] ??= []).push({ game: e.game, tier: TIERS[g.tier] });
    }
    const circuits = [];
    for (const e of evs("SELECT block, tx, args FROM events WHERE name='CircuitSubmitted' ORDER BY block DESC")) {
      const id = Number(e.args.circuitId);
      circuits.push({ id, owner: e.args.owner, handle: e.args.handle, gates: Number(e.args.gateCount), table: e.args.table, block: e.block, tx: e.tx, wins: winners[id] ?? [] });
    }
    for (const c of circuits.filter((c) => c.wins.length)) c.netlist = await netlistOf(c.id).catch(() => null);
    return { circuits };
  }
  if (path === "/challenges") {
    const ids = await cached("challenges", 10_000, () => client.readContract({ address: ARENA, abi: arenaAbi, functionName: "openChallenges" }));
    return { open: await Promise.all(ids.map(async (id) => view(await readGame(Number(id))))) };
  }
  return null;
}

const origins = (E.CORS_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (origin && (origins.includes(origin) || /^https:\/\/gatewars[-\w]*\.vercel\.app$/.test(origin) || /^http:\/\/localhost(:\d+)?$/.test(origin))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  if (req.method !== "GET") return res.writeHead(405).end();
  try {
    const body = await route(new URL(req.url, "http://x").pathname.replace(/\/$/, "") || "/health");
    if (!body) return res.writeHead(404, { "content-type": "application/json" }).end('{"error":"not found"}');
    res.writeHead(200, { "content-type": "application/json", "cache-control": "public, max-age=10" }).end(json(body));
  } catch (e) {
    res.writeHead(500, { "content-type": "application/json" }).end(json({ error: String(e?.shortMessage ?? e?.message ?? e) }));
  }
}).listen(Number(E.API_PORT ?? 8787), E.API_HOST ?? "127.0.0.1", () => log(`api listening on ${E.API_HOST ?? "127.0.0.1"}:${E.API_PORT ?? 8787}`));

// ---------------------------------------------------------------- keeper
const account = E.KEEPER_PRIVATE_KEY ? privateKeyToAccount(E.KEEPER_PRIVATE_KEY) : null;
const wallet = account ? createWalletClient({ account, chain: bsc, transport: http(E.TX_RPC_URL ?? "https://bsc-dataseed.bnbchain.org") }) : null;
const tried = new Map(); // game -> last attempt time (avoid hammering a reverting call)

async function keeperOnce() {
  const next = Number(await client.readContract({ address: ARENA, abi: arenaAbi, functionName: "nextGameId" }));
  const now = Math.floor(Date.now() / 1000);
  for (let id = 1; id < next; id++) {
    const g = await client.readContract({ address: ARENA, abi: arenaAbi, functionName: "game", args: [BigInt(id)] });
    const state = STATES[g.state];
    let action = null;
    if (state === "FULL" && g.tier !== 2) action = "settle";
    else if (state === "OPEN" && now >= Number(g.expiresAt) + 30) action = "expire";
    if (!action) continue;
    if (Date.now() - (tried.get(id) ?? 0) < 10 * 60_000) continue;
    tried.set(id, Date.now());
    if (E.KEEPER_ENABLED !== "1" || !wallet) {
      log(`[dry-run] would ${action}(${id})`);
      continue;
    }
    try {
      const bal = await client.getBalance({ address: account.address });
      const { request } = await client.simulateContract({ account, address: ARENA, abi: arenaAbi, functionName: action, args: [BigInt(id)] });
      const gas = await client.estimateContractGas({ account, address: ARENA, abi: arenaAbi, functionName: action, args: [BigInt(id)] });
      const gp = await client.getGasPrice();
      if (bal < (gas * gp * 12n) / 10n) {
        log(`keeper balance too low for ${action}(${id}): ${bal} wei`);
        db.prepare("INSERT INTO keeper_tx VALUES(?,?,?,?,?,?)").run(Date.now(), id, action, null, "skipped", "low balance");
        continue;
      }
      const hash = await wallet.writeContract(request);
      const rc = await client.waitForTransactionReceipt({ hash, timeout: 120_000 });
      log(`keeper ${action}(${id}) tx ${hash} ${rc.status} gas ${rc.gasUsed}`);
      db.prepare("INSERT INTO keeper_tx VALUES(?,?,?,?,?,?)").run(Date.now(), id, action, hash, rc.status, null);
    } catch (e) {
      const msg = String(e?.shortMessage ?? e?.message ?? e).slice(0, 300);
      log(`keeper ${action}(${id}) failed: ${msg}`);
      db.prepare("INSERT INTO keeper_tx VALUES(?,?,?,?,?,?)").run(Date.now(), id, action, null, "error", msg);
    }
  }
}

async function loop(fn, ms, name) {
  for (;;) {
    try {
      await fn();
    } catch (e) {
      log(`${name} error: ${String(e?.shortMessage ?? e?.message ?? e).slice(0, 200)}`);
    }
    await new Promise((r) => setTimeout(r, ms));
  }
}

log(`gatewars keeper start; keeper ${account ? account.address : "none"} enabled=${E.KEEPER_ENABLED === "1"}`);
loop(indexOnce, POLL_MS, "indexer");
loop(keeperOnce, KEEPER_MS, "keeper");
