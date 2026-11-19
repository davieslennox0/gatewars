"use client";
import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { play } from "@gatewars/compiler";
import { ADDR, arenaAbi, registryAbi, processorAbi, STATES, ZERO, type GameView } from "./contracts";

export const API = process.env.NEXT_PUBLIC_API_URL || "";

export function useGame(id: bigint | number | undefined) {
  const pc = usePublicClient();
  return useQuery({
    queryKey: ["game", String(id)],
    enabled: !!pc && !!id,
    refetchInterval: 15_000,
    queryFn: async () => (await pc!.readContract({ address: ADDR.arena, abi: arenaAbi, functionName: "game", args: [BigInt(id!)] })) as GameView,
  });
}

export function useQuotes() {
  const pc = usePublicClient();
  return useQuery({
    queryKey: ["quotes"],
    enabled: !!pc,
    refetchInterval: 20_000,
    queryFn: async () =>
      Promise.all(
        [0, 1, 2].map(async (t) => {
          const [bnbWei, usdc] = await pc!.readContract({ address: ADDR.arena, abi: arenaAbi, functionName: "quoteEntry", args: [t] });
          const usd = await pc!.readContract({ address: ADDR.arena, abi: arenaAbi, functionName: "tierFeeUsd", args: [BigInt(t)] });
          return { bnbWei, usdc, usd };
        }),
      ),
  });
}

/** All games from chain (small numbers during the hackathon; the indexer API is optional). */
export function useAllGames() {
  const pc = usePublicClient();
  return useQuery({
    queryKey: ["allGames"],
    enabled: !!pc,
    refetchInterval: 30_000,
    queryFn: async () => {
      const next = await pc!.readContract({ address: ADDR.arena, abi: arenaAbi, functionName: "nextGameId" });
      const ids = Array.from({ length: Number(next) - 1 }, (_, i) => BigInt(i + 1));
      const games = await Promise.all(ids.map((id) => pc!.readContract({ address: ADDR.arena, abi: arenaAbi, functionName: "game", args: [id] })));
      return games as GameView[];
    },
  });
}

export function useTables(ids: readonly bigint[] | undefined) {
  const pc = usePublicClient();
  return useQuery({
    queryKey: ["tables", ids?.map(String).join(",")],
    enabled: !!pc && !!ids?.length,
    staleTime: Infinity,
    queryFn: async () => {
      const out: Record<string, bigint> = {};
      await Promise.all(ids!.map(async (id) => (out[String(id)] = await pc!.readContract({ address: ADDR.registry, abi: registryAbi, functionName: "tableOf", args: [id] }))));
      return out;
    },
  });
}

export function useNetlist(id: bigint | undefined) {
  const pc = usePublicClient();
  return useQuery({
    queryKey: ["netlist", String(id)],
    enabled: !!pc && id !== undefined,
    staleTime: Infinity,
    queryFn: async () => pc!.readContract({ address: ADDR.processor, abi: processorAbi, functionName: "netlist", args: [id!] }),
  });
}

export type MatchRow = { a: number; b: number; scoreA: number; scoreB: number; movesA: number; movesB: number };

/** Deterministic replay of a round robin from the cached tables (identical to DuelEngine.sol). */
export function roundRobin(tables: bigint[]): { matches: MatchRow[]; totals: number[] } {
  const matches: MatchRow[] = [];
  const totals = tables.map(() => 0);
  for (let i = 0; i < tables.length; i++)
    for (let j = i + 1; j < tables.length; j++) {
      const r = play(tables[i], tables[j]);
      matches.push({ a: i, b: j, ...r });
      totals[i] += r.scoreA;
      totals[j] += r.scoreB;
    }
  return { matches, totals };
}

export const isSettled = (g: GameView) => STATES[g.state] === "SETTLED";
export const hasWinner = (g: GameView) => g.winner !== ZERO;
