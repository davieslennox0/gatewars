"use client";
import { createPublicClient, http, type Abi } from "viem";
import { bsc } from "viem/chains";
import { useQuery } from "@tanstack/react-query";

/** Read-only chain access. The site never connects a wallet: players act through their agent (GateWars skill). */
export const publicClient = createPublicClient({
  chain: bsc,
  transport: http(process.env.NEXT_PUBLIC_RPC_URL ?? "https://bsc-dataseed.bnbchain.org", { batch: true }),
});

export const usePC = () => publicClient;

/** Minimal replacement for wagmi's useReadContract. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useRead<T = any>(p: { address: `0x${string}`; abi: Abi | readonly unknown[]; functionName: string; args?: readonly unknown[]; enabled?: boolean; refetchInterval?: number }) {
  return useQuery({
    queryKey: ["read", p.address, p.functionName, JSON.stringify(p.args ?? [], (_, v) => (typeof v === "bigint" ? v.toString() : v))],
    enabled: p.enabled !== false,
    refetchInterval: p.refetchInterval,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queryFn: async () => (await publicClient.readContract({ address: p.address, abi: p.abi as Abi, functionName: p.functionName, args: (p.args ?? []) as any })) as T,
  });
}
