import { createPublicClient, http } from "viem";
import { bsc } from "viem/chains";
import { play } from "@gatewars/compiler";
import { ADDR, arenaAbi, registryAbi, type GameView } from "./contracts";

const client = createPublicClient({ chain: bsc, transport: http(process.env.NEXT_PUBLIC_RPC_URL ?? "https://bsc-dataseed.bnbchain.org") });

/** Server-side: the k-th round-robin match of a game, replayed from the cached tables (= MatchPlayed). */
export async function loadMatch(gameId: number, k: number) {
  const g = (await client.readContract({ address: ADDR.arena, abi: arenaAbi, functionName: "game", args: [BigInt(gameId)] })) as GameView;
  const n = g.players.length;
  const pairs: [number, number][] = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) pairs.push([i, j]);
  const pair = pairs[k];
  if (!pair) return null;
  const [ta, tb] = await Promise.all(pair.map((i) => client.readContract({ address: ADDR.registry, abi: registryAbi, functionName: "tableOf", args: [g.circuits[i]] })));
  const r = play(ta, tb);
  const nm = (i: number) => (g.handles[i] ? `${g.handles[i]}.ai` : `${g.players[i].slice(0, 6)}…${g.players[i].slice(-4)}`);
  return { g, a: nm(pair[0]), b: nm(pair[1]), ...r, total: pairs.length, played: g.state === 2 || g.state === 3 };
}
