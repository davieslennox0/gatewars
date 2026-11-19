import { parseAbi, type Address } from "viem";

export const ADDR = {
  arena: "0x46D2Ac21CD838F5eaBae7bcBa753405D5E32660C" as Address,
  registry: "0x93280c16C56ff2e2A2Fc344Db868Fabea9aeC2c9" as Address,
  processor: "0xDaC12492090F0937B6aAAd3De13E39114f18dA65" as Address,
  usdc: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d" as Address,
  agentId: "0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F" as Address,
  feed: "0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE" as Address,
};

export const TIERS = ["ROOKIE", "PRO", "CHAMPION"] as const;
export const STATES = ["NONE", "OPEN", "FULL", "SETTLED", "EXPIRED"] as const;
export const ASSETS = ["BNB", "USDC"] as const;
export const STARTERS: Record<number, string> = { 1: "TIT_FOR_TAT", 2: "GRIM_TRIGGER", 3: "ALWAYS_DEFECT" };
export const ZERO = "0x0000000000000000000000000000000000000000";

export const RISK =
  "Skill tournament. Entry fees can be lost. No returns are promised. Prizes are paid in BNB/USDC, whose value can change.";

export const arenaAbi = parseAbi([
  "function enter(uint8 tier, uint256 circuitId, uint8 asset) payable returns (uint256)",
  "function createChallenge(uint256 circuitId, uint8 asset) payable returns (uint256)",
  "function acceptChallenge(uint256 id, uint256 circuitId, uint8 asset) payable",
  "function settle(uint256 id)",
  "function expire(uint256 id)",
  "function claim()",
  "function claimRefund(uint256 id)",
  "function quoteEntry(uint8 tier) view returns (uint256 bnbWei, uint256 usdcAmount)",
  "function tierFeeUsd(uint256) view returns (uint256)",
  "function openBracket(uint8 tier) view returns (uint256)",
  "function openChallenges() view returns (uint256[])",
  "function claimableBnb(address) view returns (uint256)",
  "function claimableUsdc(address) view returns (uint256)",
  "function record(address) view returns ((uint32 matchesPlayed, uint32 wins, uint32 losses, uint32 draws, uint32 rookieWins, uint32 proWins, uint32 championWins, uint32 gamesEntered))",
  "function game(uint256 id) view returns ((uint256 id, uint8 tier, uint8 state, uint8 size, uint40 openedAt, uint40 expiresAt, address winner, address[] players, uint256[] circuits, string[] handles, uint8[] assets, uint256[] paid, uint256 poolBnb, uint256 poolUsdc, uint256 poolUsd))",
  "function nextGameId() view returns (uint256)",
  "function paused() view returns (bool)",
]);

export const registryAbi = parseAbi([
  "function submitCircuit(bytes netlist) payable returns (uint256)",
  "function tapeOutFee(uint256 gates) view returns (uint256)",
  "function tableOf(uint256) view returns (uint64)",
  "function ownerOf(uint256) view returns (address)",
  "function isStarter(uint256) view returns (bool)",
  "function circuitsOf(address) view returns (uint256[])",
  "function circuit(uint256) view returns ((address owner, uint64 table, uint32 gates, uint40 createdAt, bytes32 netlistHash))",
  "event CircuitSubmitted(uint256 indexed circuitId, address indexed owner, string handle, uint32 gateCount, uint64 table)",
]);

export const processorAbi = parseAbi(["function netlist(uint256 id) view returns (bytes)"]);
export const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
]);
export const agentIdAbi = parseAbi(["function balanceOf(address) view returns (uint256)", "function handleOf(address) view returns (string)"]);
export const feedAbi = parseAbi(["function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)"]);

export type GameView = {
  id: bigint;
  tier: number;
  state: number;
  size: number;
  openedAt: number;
  expiresAt: number;
  winner: Address;
  players: readonly Address[];
  circuits: readonly bigint[];
  handles: readonly string[];
  assets: readonly number[];
  paid: readonly bigint[];
  poolBnb: bigint;
  poolUsdc: bigint;
  poolUsd: bigint;
};

export const bscscan = (a: string) => `https://bscscan.com/address/${a}`;
export const bscscanTx = (h: string) => `https://bscscan.com/tx/${h}`;
export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
export const displayName = (handle: string | undefined, addr: string) => (handle ? `${handle}.ai` : short(addr));
export const STARTER_NAMES = ["", "TIT_FOR_TAT", "GRIM_TRIGGER", "ALWAYS_DEFECT"];
