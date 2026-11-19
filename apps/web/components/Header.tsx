"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount, useConnect, useDisconnect, useReadContract, useSwitchChain } from "wagmi";
import { bsc } from "wagmi/chains";
import { ADDR, agentIdAbi, displayName } from "@/lib/contracts";

const LINKS = [
  ["/", "Arena"],
  ["/builder", "Builder"],
  ["/challenges", "Challenges"],
  ["/circuits", "Hall of Circuits"],
  ["/leaderboard", "Leaderboard"],
  ["/agents", "Agents"],
  ["/rules", "Rules"],
] as const;

export default function Header() {
  const path = usePathname();
  return (
    <header className="top">
      <Link href="/" className="logo">
        ▚ GATEWARS
      </Link>
      <nav className="links">
        {LINKS.map(([href, label]) => (
          <Link key={href} href={href} className={path === href ? "active" : ""}>
            {label}
          </Link>
        ))}
      </nav>
      <Connect />
    </header>
  );
}

function Connect() {
  const { address, chainId, isConnected } = useAccount();
  const { connectors, connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const { data: handle } = useReadContract({ address: ADDR.agentId, abi: agentIdAbi, functionName: "handleOf", args: address ? [address] : undefined, query: { enabled: !!address } });
  if (!isConnected)
    return (
      <div className="row">
        {connectors.map((c) => (
          <button key={c.uid} disabled={isPending} onClick={() => connect({ connector: c, chainId: bsc.id })}>
            {c.name === "Injected" ? "Connect wallet" : c.name}
          </button>
        ))}
      </div>
    );
  return (
    <div className="row">
      {chainId !== bsc.id && (
        <button className="secondary" onClick={() => switchChain({ chainId: bsc.id })}>
          Switch to BSC
        </button>
      )}
      <span className="pill">{displayName(handle as string | undefined, address!)}</span>
      <button className="secondary" onClick={() => disconnect()}>
        ×
      </button>
    </div>
  );
}
