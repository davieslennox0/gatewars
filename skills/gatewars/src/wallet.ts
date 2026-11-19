/**
 * Thin wrapper over the binance-agentic-wallet `baw` CLI. GateWars never signs anything itself:
 * it only builds calldata and asks the wallet for a PREVIEW. Execution is a separate, explicit step
 * (`gatewars exec <requestId>`) that the agent runs only after the user confirms the preview.
 * If the wallet blocks anything (limits, Developer Mode, risk checks), we stop and report it.
 */
import { spawnSync } from "node:child_process";
import type { Address, Hex } from "viem";

const BAW = process.env.BAW_BIN ?? "baw";

export function baw(args: string[]): any {
  const r = spawnSync(BAW, [...args, "--json"], { encoding: "utf8", timeout: 120_000 });
  if (r.error) throw new Error(`cannot run baw (${r.error.message}). Install the binance-agentic-wallet skill first.`);
  let j: any;
  try {
    j = JSON.parse(r.stdout || "{}");
  } catch {
    throw new Error(`baw returned non-JSON output: ${(r.stdout || r.stderr).slice(0, 300)}`);
  }
  if (j.success === false || r.status !== 0) {
    const msg = j.message || j.error?.message || j.code || r.stderr || "unknown error";
    throw new Error(`WALLET BLOCKED / ERROR: ${typeof msg === "string" ? msg : JSON.stringify(msg)} — stop and report this to the user.`);
  }
  return j.data ?? j;
}

export function walletAddress(): Address {
  if (process.env.GATEWARS_ADDRESS) return process.env.GATEWARS_ADDRESS as Address;
  const d = baw(["wallet", "address"]);
  const list: any[] = d.addresses ?? [];
  const a = (list.find((x) => x.binanceChainId === "56") ?? list.find((x) => /^0x[0-9a-fA-F]{40}$/.test(x.address)))?.address;
  if (!a) throw new Error(`could not read wallet address from baw: ${JSON.stringify(d).slice(0, 200)}`);
  return a as Address;
}

export function requireDevMode() {
  const s = baw(["wallet", "settings"]);
  const dm = s.devMode;
  if (!dm?.enabled) {
    throw new Error(
      "Developer Mode is off. Enable it in the Binance App (Agentic Wallet management page -> Settings -> Developer Mode), then retry.",
    );
  }
}

export type Preview = { requestId: string; summary: string; raw: any };

/** Preview a contract call (never executes). */
export function preview(from: Address, to: Address, data: Hex, valueWei: bigint, label: string): Preview {
  const p = baw([
    "contract-call", "preview",
    "--binanceChainId", "56",
    "--from", from,
    "--to", to,
    "--value", valueWei.toString(),
    "--inputData", data,
  ]);
  const sr = p.simulationResult ?? {};
  const changes = (sr.balanceChanges ?? []).map((c: any) => `${c.tokenType === "Native" ? "BNB" : c.contractAddress} ${c.change}`);
  const risks = p.risks?.riskDetails ?? [];
  const lines = [
    `PREVIEW: ${label}`,
    `  to ${to}  value ${valueWei} wei`,
    `  simulation ${sr.simulationCode ?? "?"}${sr.simulationErrorDetail ? ` (${sr.simulationErrorDetail})` : ""}`,
    `  balance changes: ${changes.join(", ") || "none"}`,
    `  allowance changes: ${JSON.stringify(sr.allowanceChanges ?? [])}`,
    `  authority changes: ${JSON.stringify(sr.authorityChanges ?? [])}`,
    `  risks: ${risks.length ? JSON.stringify(risks) : "none"}`,
    `  requestId: ${p.requestId}`,
    `Ask the user to confirm, then run: gatewars exec ${p.requestId}`,
  ];
  if (sr.simulationCode && sr.simulationCode !== "000000000") lines.push("  !! simulation failed — do NOT execute.");
  return { requestId: p.requestId, summary: lines.join("\n"), raw: p };
}

export function execute(requestId: string): { status: string; txHash?: Hex } {
  const r = baw(["contract-call", "execute", "--requestId", requestId]);
  return { status: r.status, txHash: r.txHash };
}
