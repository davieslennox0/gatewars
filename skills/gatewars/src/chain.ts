import { createPublicClient, http, parseAbi, type Address } from "viem";
import { bsc } from "viem/chains";

export const ADDR = {
  arena: "0x46D2Ac21CD838F5eaBae7bcBa753405D5E32660C" as Address,
  registry: "0x93280c16C56ff2e2A2Fc344Db868Fabea9aeC2c9" as Address,
  processor: "0xDaC12492090F0937B6aAAd3De13E39114f18dA65" as Address,
  usdc: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d" as Address,
  agentId: "0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F" as Address,
};

export const STARTER_IDS = { TIT_FOR_TAT: 1n, GRIM_TRIGGER: 2n, ALWAYS_DEFECT: 3n };
export const TIERS = ["ROOKIE", "PRO", "CHAMPION"] as const;
export const ASSETS = ["BNB", "USDC"] as const;
export const STATES = ["NONE", "OPEN", "FULL", "SETTLED", "EXPIRED"] as const;

export const RISK =
  "Skill tournament. Entry fees can be lost. No returns are promised. Prizes are paid in BNB/USDC whose value can change.";

export const arenaAbi = parseAbi([
  "function enter(uint8 tier, uint256 circuitId, uint8 asset) payable returns (uint256)",
  "function createChallenge(uint256 circuitId, uint8 asset) payable returns (uint256)",
  "function acceptChallenge(uint256 id, uint256 circuitId, uint8 asset) payable",
  "function settle(uint256 id)",
  "function expire(uint256 id)",
  "function claim()",
  "function claimRefund(uint256 id)",
  "function quoteEntry(uint8 tier) view returns (uint256 bnbWei, uint256 usdcAmount)",
  "function openBracket(uint8 tier) view returns (uint256)",
  "function openChallenges() view returns (uint256[])",
  "function claimableBnb(address) view returns (uint256)",
  "function claimableUsdc(address) view returns (uint256)",
  "function record(address) view returns ((uint32 matchesPlayed, uint32 wins, uint32 losses, uint32 draws, uint32 rookieWins, uint32 proWins, uint32 championWins, uint32 gamesEntered))",
  "function game(uint256 id) view returns ((uint256 id, uint8 tier, uint8 state, uint8 size, uint40 openedAt, uint40 expiresAt, address winner, address[] players, uint256[] circuits, string[] handles, uint8[] assets, uint256[] paid, uint256 poolBnb, uint256 poolUsdc, uint256 poolUsd))",
  "function standings(uint256 id) view returns (address[] players, uint256[] scores)",
  "function nextGameId() view returns (uint256)",
  "function tierFeeUsd(uint256) view returns (uint256)",
  "function paused() view returns (bool)",
  "event MatchPlayed(uint256 indexed id, address indexed a, address indexed b, uint16 scoreA, uint16 scoreB, uint40 movesA, uint40 movesB)",
  "event Settled(uint256 indexed id, address indexed winner, uint256 poolBnb, uint256 poolUsdc)",
  "event EntryPaid(uint256 indexed id, address indexed player, uint8 asset, uint256 amount, uint256 priceUsed, uint256 excess)",
  "event Entered(uint256 indexed id, address indexed player, uint256 circuitId, uint8 slot, string handle)",
  "event Claimed(address indexed player, uint256 bnbAmount, uint256 usdcAmount)",
  "event Refunded(uint256 indexed id, address indexed player, uint8 asset, uint256 amount)",
]);

export const registryAbi = parseAbi([
  "function submitCircuit(bytes netlist) payable returns (uint256)",
  "function tapeOutFee(uint256 gates) view returns (uint256)",
  "function tableOf(uint256) view returns (uint64)",
  "function ownerOf(uint256) view returns (address)",
  "function isStarter(uint256) view returns (bool)",
  "function circuitsOf(address) view returns (uint256[])",
  "function circuit(uint256) view returns ((address owner, uint64 table, uint32 gates, uint40 createdAt, bytes32 netlistHash))",
  "function paused() view returns (bool)",
  "event CircuitSubmitted(uint256 indexed circuitId, address indexed owner, string handle, uint32 gateCount, uint64 table)",
]);

export const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
]);

export const agentIdAbi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function handleOf(address) view returns (string)",
]);

export const client = createPublicClient({
  chain: bsc,
  transport: http(process.env.GATEWARS_RPC ?? "https://bsc-dataseed.bnbchain.org"),
});

/** Indexer API (history: matches, winners, leaderboard). */
export const API = process.env.GATEWARS_API ?? "https://api.gatewars.xyz";

export async function api<T>(path: string): Promise<T | null> {
  try {
    const r = await fetch(`${API}${path}`, { signal: AbortSignal.timeout(8000) });
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}
