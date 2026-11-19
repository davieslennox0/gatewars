// GateWars admin: https://api.pitchook.xyz/admin (Caddy -> 127.0.0.1:8788)
// - Access code checked against an scrypt hash; stateless HMAC-signed session cookie (30 min), CSRF tokens.
// - 5 failed logins / 15 min per IP -> locked. Every login and action goes to audit.log.
// - Owner actions are simulated first and need a typed CONFIRM; the owner key never leaves this process.
// - Treasury / fee withdrawals can only go to the keeper wallet (fixed, not a form field).
import { createServer } from "node:http";
import { readFileSync, existsSync, appendFileSync, writeFileSync, unlinkSync, statSync, openSync, readSync, closeSync } from "node:fs";
import { createHmac, scryptSync, timingSafeEqual, randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { createPublicClient, createWalletClient, http, parseAbi, formatEther, formatUnits, parseEther, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bsc } from "viem/chains";

// ---------------------------------------------------------------- config
function loadEnv(url) {
  const out = {};
  if (!existsSync(url)) return out;
  for (const line of readFileSync(url, "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2];
  }
  return out;
}
const E = { ...loadEnv(new URL("../.env", import.meta.url)), ...process.env };
const OWNER_KEY = loadEnv(new URL("../../../.env", import.meta.url)).OWNER_PRIVATE_KEY;
const KEEPER_KEY = loadEnv(new URL("../../keeper/.env", import.meta.url)).KEEPER_PRIVATE_KEY;
if (!E.ADMIN_CODE_HASH || !E.ADMIN_SECRET) throw new Error("ADMIN_CODE_HASH / ADMIN_SECRET missing in apps/admin/.env");
const SECRET = Buffer.from(E.ADMIN_SECRET, "hex");
const AUDIT = new URL("../audit.log", import.meta.url);
const KEEPER_LOG = new URL("../../keeper/keeper.log", import.meta.url);
const KEEPER_DB = new URL("../../keeper/gatewars.sqlite", import.meta.url);
const KEEPER_DISABLE = new URL("../../keeper/keeper.disabled", import.meta.url);

const ARENA = "0x46D2Ac21CD838F5eaBae7bcBa753405D5E32660C";
const REGISTRY = "0x93280c16C56ff2e2A2Fc344Db868Fabea9aeC2c9";
const USDC = "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";
const BEM = "0x5ce033B2bFCa3Af30b3e8C8457DeaF776A8b695a";
const FEED = "0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE";
const owner = OWNER_KEY ? privateKeyToAccount(OWNER_KEY) : null;
const keeper = KEEPER_KEY ? privateKeyToAccount(KEEPER_KEY) : null;
const PAYOUT = keeper?.address; // all withdrawals go here, nowhere else

const arenaAbi = parseAbi([
  "function owner() view returns (address)",
  "function paused() view returns (bool)",
  "function pause()",
  "function unpause()",
  "function setTierFeeUsd(uint8 tier, uint256 usd8)",
  "function setMaxPriceAge(uint256 secondsAge)",
  "function withdrawTreasury(uint8 asset, address to, uint256 amount)",
  "function settle(uint256 id)",
  "function expire(uint256 id)",
  "function tierFeeUsd(uint256) view returns (uint256)",
  "function maxPriceAge() view returns (uint256)",
  "function locked(uint256) view returns (uint256)",
  "function claimableTotal(uint256) view returns (uint256)",
  "function treasury(uint256) view returns (uint256)",
  "function nextGameId() view returns (uint256)",
  "function game(uint256 id) view returns ((uint256 id, uint8 tier, uint8 state, uint8 size, uint40 openedAt, uint40 expiresAt, address winner, address[] players, uint256[] circuits, string[] handles, uint8[] assets, uint256[] paid, uint256 poolBnb, uint256 poolUsdc, uint256 poolUsd))",
]);
const registryAbi = parseAbi([
  "function owner() view returns (address)",
  "function paused() view returns (bool)",
  "function pause()",
  "function unpause()",
  "function setFeePerGate(uint256 weiPerGate)",
  "function mintTransistors(uint256 amount)",
  "function withdrawFees(address to, uint256 amount)",
  "function feePerGateWei() view returns (uint256)",
  "function feesAccrued() view returns (uint256)",
  "function nandBalance() view returns (uint256)",
]);
const erc20 = parseAbi(["function balanceOf(address) view returns (uint256)"]);
const feedAbi = parseAbi(["function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)"]);

const RPC = E.TX_RPC_URL ?? "https://bsc-dataseed.bnbchain.org";
const pc = createPublicClient({ chain: bsc, transport: http(RPC) });
const ownerW = owner ? createWalletClient({ account: owner, chain: bsc, transport: http(RPC) }) : null;
const keeperW = keeper ? createWalletClient({ account: keeper, chain: bsc, transport: http(RPC) }) : null;
const TIERS = ["ROOKIE", "PRO", "CHAMPION"];
const STATES = ["NONE", "OPEN", "FULL", "SETTLED", "EXPIRED"];

// ---------------------------------------------------------------- auth
const b64 = (b) => Buffer.from(b).toString("base64url");
const sign = (s) => createHmac("sha256", SECRET).update(s).digest("base64url");
function makeToken(obj, ttlSec) {
  const body = b64(JSON.stringify({ ...obj, exp: Math.floor(Date.now() / 1000) + ttlSec }));
  return `${body}.${sign(body)}`;
}
function readToken(tok) {
  if (!tok || !tok.includes(".")) return null;
  const [body, mac] = tok.split(".");
  const want = sign(body);
  if (mac.length !== want.length || !timingSafeEqual(Buffer.from(mac), Buffer.from(want))) return null;
  try {
    const o = JSON.parse(Buffer.from(body, "base64url").toString());
    return o.exp > Date.now() / 1000 ? o : null;
  } catch {
    return null;
  }
}
function checkCode(code) {
  const [saltHex, hashHex] = E.ADMIN_CODE_HASH.split(":");
  const got = scryptSync(String(code ?? "").trim(), Buffer.from(saltHex, "hex"), 64, { N: 16384, r: 8, p: 1 });
  return timingSafeEqual(got, Buffer.from(hashHex, "hex"));
}
const fails = new Map(); // ip -> [timestamps]
function locked(ip) {
  const now = Date.now();
  const f = (fails.get(ip) ?? []).filter((t) => now - t < 15 * 60_000);
  fails.set(ip, f);
  return f.length >= 5;
}
function audit(ip, event, detail = {}) {
  appendFileSync(AUDIT, JSON.stringify({ at: new Date().toISOString(), ip, event, ...detail }) + "\n");
}

// ---------------------------------------------------------------- html
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const CSS = `:root{--bg:#EEF1F4;--panel:#fff;--panel2:#F6F8FA;--line:#DCE2E8;--line2:#C9D2DB;--ink:#161B22;--ink3:#4A5561;--muted:#5F6B77;--coop:#2F6FA3;--defect:#D9773E;--select:#E8EEF5;--rbg:#FBF4E4;--rline:#E8D4A8;--rtext:#5C4510}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 "IBM Plex Sans",system-ui,sans-serif}
.w{max-width:1200px;margin:0 auto;padding:16px}h1{font-size:24px;margin:8px 0 4px}h2{font-size:16px;margin:0 0 10px}
.p{background:var(--panel);border:1px solid var(--line);border-radius:2px;padding:16px;margin:12px 0}
.g{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(280px,1fr))}
.l{font:500 11px "IBM Plex Mono",monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.m{font-family:"IBM Plex Mono",ui-monospace,monospace}.v{font:700 18px "IBM Plex Mono",monospace}
table{width:100%;border-collapse:collapse;font:12px "IBM Plex Mono",monospace}th,td{text-align:left;padding:8px;border-bottom:1px solid var(--line)}th{color:var(--muted);font-size:10px;letter-spacing:.12em;text-transform:uppercase;background:var(--panel2)}
.ok{color:var(--coop);font-weight:700}.bad{color:var(--defect);font-weight:700}
input,select{font:13px "IBM Plex Mono",monospace;padding:8px;border:1px solid var(--line2);border-radius:2px;min-height:40px}
button{font:600 12px "IBM Plex Mono",monospace;letter-spacing:.06em;text-transform:uppercase;min-height:40px;padding:0 14px;border-radius:2px;border:1px solid var(--ink);background:var(--ink);color:#fff;cursor:pointer}
button.o{background:#fff;color:var(--ink);border-color:var(--line2)}form.i{display:inline-flex;gap:6px;align-items:center;flex-wrap:wrap;margin:4px 0}
.risk{background:var(--rbg);border:1px solid var(--rline);color:var(--rtext);padding:10px;border-radius:2px}
pre{white-space:pre-wrap;font:11px/1.5 "IBM Plex Mono",monospace;background:var(--panel2);border:1px solid var(--line);padding:10px;max-height:320px;overflow:auto}
a{color:var(--coop)}.top{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}`;
function page(title, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${esc(title)} · GateWars admin</title><style>${CSS}</style></head><body><div class="w">${body}</div></body></html>`;
}
const csrfField = (sess) => `<input type="hidden" name="csrf" value="${esc(sign(`csrf:${sess.exp}`))}">`;

// ---------------------------------------------------------------- data
const fb = (x, d = 6) => `${Number(formatEther(x)).toFixed(d)}`;
const fu = (x) => `${Number(formatUnits(x, 18)).toFixed(2)}`;
async function snapshot() {
  const r = (address, abi, functionName, args = []) => pc.readContract({ address, abi, functionName, args });
  const [aOwner, rOwner, aPaused, rPaused, fees, mpa, locked0, locked1, claim0, claim1, tre0, tre1, bnbBal, usdcBal, fpg, feesAcc, nand, regBem, regBnb, next, px] = await Promise.all([
    r(ARENA, arenaAbi, "owner"), r(REGISTRY, registryAbi, "owner"), r(ARENA, arenaAbi, "paused"), r(REGISTRY, registryAbi, "paused"),
    Promise.all([0, 1, 2].map((t) => r(ARENA, arenaAbi, "tierFeeUsd", [BigInt(t)]))), r(ARENA, arenaAbi, "maxPriceAge"),
    r(ARENA, arenaAbi, "locked", [0n]), r(ARENA, arenaAbi, "locked", [1n]), r(ARENA, arenaAbi, "claimableTotal", [0n]), r(ARENA, arenaAbi, "claimableTotal", [1n]),
    r(ARENA, arenaAbi, "treasury", [0n]), r(ARENA, arenaAbi, "treasury", [1n]), pc.getBalance({ address: ARENA }), r(USDC, erc20, "balanceOf", [ARENA]),
    r(REGISTRY, registryAbi, "feePerGateWei"), r(REGISTRY, registryAbi, "feesAccrued"), r(REGISTRY, registryAbi, "nandBalance"), r(BEM, erc20, "balanceOf", [REGISTRY]),
    pc.getBalance({ address: REGISTRY }), r(ARENA, arenaAbi, "nextGameId"), r(FEED, feedAbi, "latestRoundData"),
  ]);
  const games = await Promise.all(Array.from({ length: Number(next) - 1 }, (_, i) => r(ARENA, arenaAbi, "game", [BigInt(i + 1)])));
  const keeperBal = keeper ? await pc.getBalance({ address: keeper.address }) : 0n;
  const ownerBal = owner ? await pc.getBalance({ address: owner.address }) : 0n;
  let api = null;
  try {
    api = await (await fetch("http://127.0.0.1:8787/health", { signal: AbortSignal.timeout(4000) })).json();
  } catch {}
  const head = await pc.getBlockNumber();
  return { aOwner, rOwner, aPaused, rPaused, fees, mpa, locked: [locked0, locked1], claim: [claim0, claim1], tre: [tre0, tre1], bal: [bnbBal, usdcBal], fpg, feesAcc, nand, regBem, regBnb, games, keeperBal, ownerBal, api, head, px: Number(px[1]) / 1e8 };
}
function tail(url, n = 40) {
  if (!existsSync(url)) return "";
  const size = statSync(url).size;
  const len = Math.min(size, 16_000);
  const fd = openSync(url, "r");
  const buf = Buffer.alloc(len);
  readSync(fd, buf, 0, len, size - len);
  closeSync(fd);
  return buf.toString().split("\n").slice(-n).join("\n");
}
function keeperTx() {
  try {
    const db = new DatabaseSync(KEEPER_DB.pathname, { readOnly: true });
    const rows = db.prepare("SELECT at, game, action, tx, status, error FROM keeper_tx ORDER BY at DESC LIMIT 15").all();
    db.close();
    return rows;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------- actions (allowlist)
const ACTIONS = {
  arenaPause: { label: "Pause Arena (blocks new entries only)", who: "owner", build: () => ({ address: ARENA, abi: arenaAbi, functionName: "pause", args: [] }) },
  arenaUnpause: { label: "Unpause Arena", who: "owner", build: () => ({ address: ARENA, abi: arenaAbi, functionName: "unpause", args: [] }) },
  registryPause: { label: "Pause Registry (blocks new submissions only)", who: "owner", build: () => ({ address: REGISTRY, abi: registryAbi, functionName: "pause", args: [] }) },
  registryUnpause: { label: "Unpause Registry", who: "owner", build: () => ({ address: REGISTRY, abi: registryAbi, functionName: "unpause", args: [] }) },
  setTierFeeUsd: {
    label: "Set tier fee (USD)",
    who: "owner",
    build: (p) => {
      const t = Number(p.tier);
      const usd = Number(p.usd);
      if (![0, 1, 2].includes(t) || !(usd > 0 && usd <= 1000)) throw new Error("tier 0-2, usd 0-1000");
      return { address: ARENA, abi: arenaAbi, functionName: "setTierFeeUsd", args: [t, BigInt(Math.round(usd * 1e8))] };
    },
  },
  setMaxPriceAge: {
    label: "Set max oracle price age (seconds, 300-7200)",
    who: "owner",
    build: (p) => ({ address: ARENA, abi: arenaAbi, functionName: "setMaxPriceAge", args: [BigInt(Math.floor(Number(p.seconds)))] }),
  },
  setFeePerGate: { label: "Set registry fee per gate (BNB)", who: "owner", build: (p) => ({ address: REGISTRY, abi: registryAbi, functionName: "setFeePerGate", args: [parseEther(String(p.bnb || "0"))] }) },
  withdrawTreasury: {
    label: "Withdraw treasury → keeper wallet",
    who: "owner",
    build: (p) => {
      const asset = p.asset === "USDC" ? 1 : 0;
      const amount = asset === 0 ? parseEther(String(p.amount)) : parseUnits(String(p.amount), 18);
      if (amount <= 0n) throw new Error("amount must be > 0");
      return { address: ARENA, abi: arenaAbi, functionName: "withdrawTreasury", args: [asset, PAYOUT, amount] };
    },
  },
  withdrawFees: {
    label: "Withdraw registry per-gate fees → keeper wallet",
    who: "owner",
    build: (p) => ({ address: REGISTRY, abi: registryAbi, functionName: "withdrawFees", args: [PAYOUT, parseEther(String(p.amount))] }),
  },
  mintTransistors: {
    label: "Mint NAND transistors (registry BEM)",
    who: "owner",
    build: (p) => {
      const n = BigInt(Math.floor(Number(p.amount)));
      if (n <= 0n || n > 500000n) throw new Error("1-500000");
      return { address: REGISTRY, abi: registryAbi, functionName: "mintTransistors", args: [n] };
    },
  },
  settle: { label: "Settle game (keeper wallet)", who: "keeper", build: (p) => ({ address: ARENA, abi: arenaAbi, functionName: "settle", args: [BigInt(p.id)] }) },
  expire: { label: "Expire game (keeper wallet)", who: "keeper", build: (p) => ({ address: ARENA, abi: arenaAbi, functionName: "expire", args: [BigInt(p.id)] }) },
};

async function simulate(name, params) {
  const a = ACTIONS[name];
  if (!a) throw new Error("unknown action");
  const acct = a.who === "owner" ? owner : keeper;
  if (!acct) throw new Error(`${a.who} key not configured`);
  if (name.startsWith("withdraw") && !PAYOUT) throw new Error("keeper (payout) address unknown");
  const call = a.build(params);
  const { request } = await pc.simulateContract({ account: acct, ...call });
  const gas = await pc.estimateContractGas({ account: acct, ...call });
  return { a, call, request, gas, acct };
}

// ---------------------------------------------------------------- views
function loginView(msg = "") {
  return page(
    "Login",
    `<h1>GateWars admin</h1><div class="p" style="max-width:420px"><form method="post" action="/admin/login"><label class="l" for="c">Access code</label><br><input id="c" name="code" type="password" autocomplete="current-password" required style="width:100%;margin:8px 0" autofocus><button type="submit">Enter</button></form>${msg ? `<p class="bad">${esc(msg)}</p>` : ""}</div>`,
  );
}

function actionForm(sess, name, fields = "", btnClass = "o") {
  return `<form class="i" method="post" action="/admin/preview">${csrfField(sess)}<input type="hidden" name="action" value="${name}">${fields}<button class="${btnClass}" type="submit">${esc(ACTIONS[name].label)}</button></form>`;
}

async function dashboard(sess) {
  const s = await snapshot();
  const now = Math.floor(Date.now() / 1000);
  const solv = [0, 1].map((i) => s.bal[i] >= s.locked[i] + s.claim[i] + s.tre[i]);
  const lag = s.api ? Number(s.head) - s.api.lastBlock : null;
  const keeperOn = !existsSync(KEEPER_DISABLE) && s.api?.keeper;
  const kt = keeperTx();
  const games = [...s.games].reverse();
  return page(
    "Dashboard",
    `<div class="top"><div><h1>GateWars admin</h1><span class="l">block ${s.head} · BNB/USD $${s.px.toFixed(2)} · session expires ${new Date(sess.exp * 1000).toISOString().slice(11, 16)} UTC</span></div>
<form method="post" action="/admin/logout">${csrfField(sess)}<button class="o">Log out</button></form></div>
<div class="g">
 <div class="p"><h2>Arena accounting</h2><table><tr><th></th><th>BNB</th><th>USDC</th></tr>
 <tr><td>locked (pools + refundable)</td><td>${fb(s.locked[0])}</td><td>${fu(s.locked[1])}</td></tr>
 <tr><td>claimable</td><td>${fb(s.claim[0])}</td><td>${fu(s.claim[1])}</td></tr>
 <tr><td>treasury (withdrawable)</td><td>${fb(s.tre[0])}</td><td>${fu(s.tre[1])}</td></tr>
 <tr><td>contract balance</td><td>${fb(s.bal[0])}</td><td>${fu(s.bal[1])}</td></tr>
 <tr><td>solvency</td><td class="${solv[0] ? "ok" : "bad"}">${solv[0] ? "OK" : "SHORT"}</td><td class="${solv[1] ? "ok" : "bad"}">${solv[1] ? "OK" : "SHORT"}</td></tr></table></div>
 <div class="p"><h2>Settings</h2><table>
 <tr><td>Arena paused</td><td class="${s.aPaused ? "bad" : "ok"}">${s.aPaused}</td></tr><tr><td>Registry paused</td><td class="${s.rPaused ? "bad" : "ok"}">${s.rPaused}</td></tr>
 <tr><td>tier fees (USD)</td><td>${s.fees.map((f) => (Number(f) / 1e8).toFixed(2)).join(" / ")}</td></tr><tr><td>max price age</td><td>${s.mpa}s</td></tr>
 <tr><td>fee per gate</td><td>${fb(s.fpg, 8)} BNB</td></tr><tr><td>owner (both)</td><td>${s.aOwner === s.rOwner ? s.aOwner.slice(0, 10) + "…" : "MISMATCH"}${owner && s.aOwner.toLowerCase() === owner.address.toLowerCase() ? ' <span class="ok">key loaded</span>' : ' <span class="bad">key NOT the owner</span>'}</td></tr></table></div>
 <div class="p"><h2>Registry &amp; wallets</h2><table>
 <tr><td>NAND stock</td><td class="${s.nand < 2000n ? "bad" : ""}">${s.nand}</td></tr><tr><td>registry BEM</td><td>${(Number(s.regBem) / 1e8).toFixed(4)}</td></tr>
 <tr><td>fees accrued</td><td>${fb(s.feesAcc)} BNB</td></tr>
 <tr><td>keeper wallet</td><td>${keeper ? keeper.address.slice(0, 10) + "…" : "—"} <span class="${s.keeperBal < 200000000000000n ? "bad" : ""}">${fb(s.keeperBal)} BNB</span></td></tr>
 <tr><td>owner wallet gas</td><td class="${s.ownerBal < 100000000000000n ? "bad" : ""}">${fb(s.ownerBal)} BNB</td></tr>
 <tr><td>indexer lag</td><td class="${lag === null || lag > 200 ? "bad" : "ok"}">${lag === null ? "API DOWN" : lag + " blocks"}</td></tr>
 <tr><td>keeper</td><td class="${keeperOn ? "ok" : "bad"}">${keeperOn ? "ON" : "OFF"}</td></tr></table>
 <form class="i" method="post" action="/admin/keeper">${csrfField(sess)}<input type="hidden" name="on" value="${keeperOn ? "0" : "1"}"><button class="o">${keeperOn ? "Turn keeper OFF" : "Turn keeper ON"}</button></form></div>
</div>
<div class="p"><h2>Games</h2><div style="overflow-x:auto"><table><tr><th>#</th><th>tier</th><th>state</th><th>seats</th><th>pool</th><th>closes</th><th>winner</th><th></th></tr>
${games
  .map((g) => {
    const st = STATES[g.state];
    const due = st === "OPEN" && now >= Number(g.expiresAt);
    const act = st === "FULL" && g.tier !== 2 ? actionForm(sess, "settle", `<input type="hidden" name="id" value="${g.id}">`, "") : due ? actionForm(sess, "expire", `<input type="hidden" name="id" value="${g.id}">`, "") : "";
    const wi = g.players.findIndex((p) => p === g.winner);
    return `<tr><td>${g.id}</td><td>${TIERS[g.tier]}</td><td>${st}</td><td>${g.players.length}/${g.size}</td><td>$${(Number(g.poolUsd) / 1e8).toFixed(2)}</td><td>${st === "OPEN" ? Math.max(0, Math.floor((Number(g.expiresAt) - now) / 60)) + "m" : "—"}</td><td>${wi >= 0 ? esc(g.handles[wi] || g.winner.slice(0, 10)) : "—"}</td><td>${act}</td></tr>`;
  })
  .join("") || '<tr><td colspan="8">no games</td></tr>'}
</table></div></div>
<div class="p"><h2>Owner controls</h2><div class="risk">Each action is simulated first; you then type CONFIRM to sign with the owner key. Withdrawals can only go to the keeper wallet ${esc(PAYOUT ?? "—")}.</div>
${actionForm(sess, s.aPaused ? "arenaUnpause" : "arenaPause")} ${actionForm(sess, s.rPaused ? "registryUnpause" : "registryPause")}<br>
${actionForm(sess, "setTierFeeUsd", `<select name="tier"><option value="0">ROOKIE</option><option value="1">PRO</option><option value="2">CHAMPION</option></select><input name="usd" placeholder="USD e.g. 1" size="8" required>`)}
${actionForm(sess, "setMaxPriceAge", `<input name="seconds" placeholder="3600" size="8" required>`)}
${actionForm(sess, "setFeePerGate", `<input name="bnb" placeholder="0" size="10" required>`)}<br>
${actionForm(sess, "withdrawTreasury", `<select name="asset"><option>BNB</option><option>USDC</option></select><input name="amount" placeholder="amount" size="12" required>`)}
${actionForm(sess, "withdrawFees", `<input name="amount" placeholder="BNB" size="12" required>`)}
${actionForm(sess, "mintTransistors", `<input name="amount" placeholder="NAND count" size="10" required>`)}</div>
<div class="g"><div class="p"><h2>Keeper transactions</h2><table><tr><th>time</th><th>game</th><th>action</th><th>status</th></tr>${kt.map((r) => `<tr><td>${new Date(r.at).toISOString().slice(5, 16)}</td><td>${r.game}</td><td>${esc(r.action)}</td><td>${r.tx ? `<a href="https://bscscan.com/tx/${esc(r.tx)}" target="_blank" rel="noreferrer">${esc(r.status)}</a>` : esc(r.status + (r.error ? ": " + r.error.slice(0, 60) : ""))}</td></tr>`).join("") || '<tr><td colspan="4">none yet</td></tr>'}</table></div>
<div class="p"><h2>Keeper log</h2><pre>${esc(tail(KEEPER_LOG, 30))}</pre></div></div>
<div class="p"><h2>Admin audit log</h2><pre>${esc(tail(AUDIT, 30))}</pre></div>`,
  );
}

// ---------------------------------------------------------------- server
async function body(req) {
  let s = "";
  for await (const c of req) {
    s += c;
    if (s.length > 10_000) throw new Error("body too large");
  }
  return Object.fromEntries(new URLSearchParams(s));
}
function cookie(req, name) {
  const m = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`).exec(req.headers.cookie ?? "");
  return m ? m[1] : null;
}
const SEC_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
  "x-frame-options": "DENY",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "x-robots-tag": "noindex, nofollow",
  "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
};
const send = (res, code, html, extra = {}) => res.writeHead(code, { ...SEC_HEADERS, ...extra }).end(html);
const redirect = (res, to, extra = {}) => res.writeHead(303, { location: to, "cache-control": "no-store", ...extra }).end();

createServer(async (req, res) => {
  const ip = (req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "").split(",")[0].trim();
  const url = new URL(req.url, "http://x");
  const path = url.pathname.replace(/\/$/, "") || "/admin";
  try {
    if (!path.startsWith("/admin")) return send(res, 404, "not found");
    if (req.method === "POST" && path === "/admin/login") {
      if (locked(ip)) {
        audit(ip, "login-locked");
        return send(res, 429, loginView("Too many attempts. Try again in 15 minutes."));
      }
      const f = await body(req);
      if (!checkCode(f.code)) {
        fails.get(ip).push(Date.now());
        audit(ip, "login-fail");
        return send(res, 401, loginView("Wrong code."));
      }
      fails.delete(ip);
      audit(ip, "login-ok");
      const tok = makeToken({ s: randomBytes(8).toString("hex") }, 30 * 60);
      return redirect(res, "/admin", { "set-cookie": `gw_admin=${tok}; Path=/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=1800` });
    }
    const sess = readToken(cookie(req, "gw_admin"));
    if (!sess) return path === "/admin" ? send(res, 200, loginView()) : redirect(res, "/admin");
    if (req.method === "GET" && path === "/admin") return send(res, 200, await dashboard(sess));
    if (req.method !== "POST") return redirect(res, "/admin");
    const f = await body(req);
    if (f.csrf !== sign(`csrf:${sess.exp}`)) {
      audit(ip, "csrf-fail", { path });
      return send(res, 403, page("Forbidden", "<h1>Invalid form token</h1><p><a href='/admin'>Back</a></p>"));
    }
    if (path === "/admin/logout") {
      audit(ip, "logout");
      return redirect(res, "/admin", { "set-cookie": "gw_admin=; Path=/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=0" });
    }
    if (path === "/admin/keeper") {
      if (f.on === "1") existsSync(KEEPER_DISABLE) && unlinkSync(KEEPER_DISABLE);
      else writeFileSync(KEEPER_DISABLE, new Date().toISOString());
      audit(ip, "keeper-toggle", { on: f.on === "1" });
      return redirect(res, "/admin");
    }
    if (path === "/admin/preview") {
      const { action, csrf, ...params } = f;
      let sim;
      try {
        sim = await simulate(action, params);
      } catch (e) {
        audit(ip, "preview-fail", { action, params, error: String(e?.shortMessage ?? e?.message ?? e).slice(0, 200) });
        return send(res, 400, page("Simulation failed", `<h1>Simulation failed</h1><div class="p"><p class="bad">${esc(e?.shortMessage ?? e?.message ?? e)}</p><a href="/admin">Back</a></div>`));
      }
      const gp = await pc.getGasPrice();
      const tok = makeToken({ action, params }, 5 * 60);
      audit(ip, "preview", { action, params });
      return send(
        res,
        200,
        page(
          "Confirm",
          `<h1>Confirm: ${esc(sim.a.label)}</h1><div class="p"><table>
<tr><td>signer</td><td class="m">${esc(sim.a.who)} ${esc(sim.acct.address)}</td></tr>
<tr><td>contract</td><td class="m">${esc(sim.call.address)}</td></tr>
<tr><td>call</td><td class="m">${esc(sim.call.functionName)}(${esc(sim.call.args.map(String).join(", "))})</td></tr>
<tr><td>simulation</td><td class="ok">OK</td></tr>
<tr><td>gas</td><td class="m">${sim.gas} (~${fb(sim.gas * gp, 6)} BNB)</td></tr></table>
<form method="post" action="/admin/execute" style="margin-top:12px">${csrfField(sess)}<input type="hidden" name="token" value="${esc(tok)}">
<label class="l" for="cf">Type CONFIRM to sign and send</label><br><input id="cf" name="confirm" autocomplete="off" required style="margin:8px 0"> <button type="submit">Sign &amp; send</button> <a href="/admin">Cancel</a></form></div>`,
        ),
      );
    }
    if (path === "/admin/execute") {
      const t = readToken(f.token);
      if (!t) return send(res, 400, page("Expired", "<h1>Preview expired (5 min). Start again.</h1><a href='/admin'>Back</a>"));
      if (f.confirm !== "CONFIRM") return send(res, 400, page("Not confirmed", "<h1>You must type CONFIRM.</h1><a href='/admin'>Back</a>"));
      const sim = await simulate(t.action, t.params); // re-simulate right before sending
      const w = sim.a.who === "owner" ? ownerW : keeperW;
      const hash = await w.writeContract(sim.request);
      audit(ip, "execute-sent", { action: t.action, params: t.params, tx: hash });
      const rc = await pc.waitForTransactionReceipt({ hash, timeout: 120_000 });
      audit(ip, "execute-mined", { action: t.action, tx: hash, status: rc.status, gas: String(rc.gasUsed) });
      return send(
        res,
        200,
        page("Done", `<h1>${rc.status === "success" ? "Done" : "Reverted"}</h1><div class="p"><p class="${rc.status === "success" ? "ok" : "bad"}">${esc(t.action)} · ${esc(rc.status)} · gas ${rc.gasUsed}</p><p class="m"><a href="https://bscscan.com/tx/${hash}" target="_blank" rel="noreferrer">${hash}</a></p><a href="/admin">Back to dashboard</a></div>`),
      );
    }
    return redirect(res, "/admin");
  } catch (e) {
    audit(ip, "error", { path, error: String(e?.shortMessage ?? e?.message ?? e).slice(0, 200) });
    return send(res, 500, page("Error", `<h1>Error</h1><pre>${esc(e?.shortMessage ?? e?.message ?? e)}</pre><a href="/admin">Back</a>`));
  }
}).listen(Number(E.ADMIN_PORT ?? 8788), E.ADMIN_HOST ?? "127.0.0.1", () => console.log(`admin on ${E.ADMIN_HOST ?? "127.0.0.1"}:${E.ADMIN_PORT ?? 8788}; owner ${owner?.address ?? "none"} keeper ${keeper?.address ?? "none"}`));
