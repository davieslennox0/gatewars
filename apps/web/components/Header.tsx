"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount, useConnect, useDisconnect, useReadContract, useSwitchChain } from "wagmi";
import { bsc } from "wagmi/chains";
import { ADDR, agentIdAbi, displayName } from "@/lib/contracts";
import { Avatar } from "./ui";

const LINKS = [
  ["/", "Lobby"],
  ["/builder", "Builder"],
  ["/challenges", "Champion"],
  ["/circuits", "Hall of Circuits"],
  ["/leaderboard", "Leaderboard"],
  ["/agents", "For Agents"],
  ["/rules", "Rules"],
] as const;

export function Logo() {
  return (
    <svg width="26" height="26" viewBox="0 0 32 32" fill="none" aria-hidden>
      <rect x="6" y="6" width="20" height="20" rx="5" stroke="#2dffb3" strokeWidth="2" />
      <path d="M11 16h4l2-4 2 8 2-4h0" stroke="#39d0ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {[10, 16, 22].map((v) => (
        <g key={v} stroke="#2dffb3" strokeWidth="2" strokeLinecap="round">
          <path d={`M${v} 2v4`} />
          <path d={`M${v} 26v4`} />
          <path d={`M2 ${v}h4`} />
          <path d={`M26 ${v}h4`} />
        </g>
      ))}
    </svg>
  );
}

export default function Header() {
  const path = usePathname();
  return (
    <header className="top">
      <div className="inner">
        <Link href="/" className="logo">
          <Logo /> GATEWARS
        </Link>
        <nav className="links">
          {LINKS.map(([href, label]) => (
            <Link key={href} href={href} className={path === href || (href !== "/" && path.startsWith(href)) ? "active" : ""}>
              {label}
            </Link>
          ))}
        </nav>
        <Connect />
      </div>
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
      <div className="row" style={{ gap: 8 }}>
        {connectors.map((c) => (
          <button key={c.uid} className="sm" disabled={isPending} onClick={() => connect({ connector: c, chainId: bsc.id })}>
            {c.name === "Injected" ? "Connect wallet" : c.name}
          </button>
        ))}
      </div>
    );
  return (
    <div className="row" style={{ gap: 8 }}>
      {chainId !== bsc.id && (
        <button className="sm volt" onClick={() => switchChain({ chainId: bsc.id })}>
          Switch to BSC
        </button>
      )}
      <span className="pill" style={{ padding: "4px 10px 4px 4px" }}>
        <Avatar addr={address!} size={22} /> {displayName(handle as string | undefined, address!)}
      </span>
      <button className="sm ghost" onClick={() => disconnect()} aria-label="disconnect">
        ⏻
      </button>
    </div>
  );
}
