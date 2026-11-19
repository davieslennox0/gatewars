"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAccount, useConnect, useDisconnect, useReadContract, useSwitchChain } from "wagmi";
import { bsc } from "wagmi/chains";
import { ADDR, arenaAbi, bscscan, RISK } from "@/lib/contracts";
import { useAgent } from "./ui";

export const NAV = [
  ["/", "LOBBY"],
  ["/builder", "BUILDER"],
  ["/challenges", "CHAMPION"],
  ["/circuits", "HALL OF CIRCUITS"],
  ["/leaderboard", "LEADERBOARD"],
  ["/agents", "FOR AGENTS"],
  ["/rules", "RULES"],
] as const;

export function Logo() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
      <rect x="4.5" y="4.5" width="13" height="13" rx="1" stroke="var(--ink)" strokeWidth="1.5" />
      <path d="M8 11h2.5l1-2.5 1.5 5 1-2.5H15" stroke="var(--coop)" strokeWidth="1.5" strokeLinecap="square" />
      {[7.5, 11, 14.5].map((v) => (
        <g key={v} stroke="var(--pin)" strokeWidth="1.5">
          <path d={`M${v} 1v3.5M${v} 18v3.5M1 ${v}h3.5M18 ${v}h3.5`} />
        </g>
      ))}
    </svg>
  );
}

const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path.startsWith(href));

export default function Header() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const burger = useRef<HTMLButtonElement>(null);

  useEffect(() => setOpen(false), [path]); // close on route change
  return (
    <header className="top">
      <div className="wrap inner">
        <Link href="/" className="logo" aria-label="GateWars lobby">
          <Logo /> GATEWARS
        </Link>
        <nav className="desk" aria-label="Main">
          {NAV.map(([href, label]) => (
            <Link key={href} href={href} aria-current={isActive(path, href) ? "page" : undefined}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="header-right">
          <IdPill />
          <button
            ref={burger}
            className="btn outline icon hamburger"
            aria-label="Open menu"
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpen(true)}
          >
            <svg width="18" height="14" viewBox="0 0 18 14" aria-hidden>
              <path d="M0 1h18M0 7h18M0 13h18" stroke="var(--ink)" strokeWidth="2" />
            </svg>
          </button>
        </div>
      </div>
      <MobileMenu open={open} onClose={() => setOpen(false)} returnFocus={burger} path={path} />
    </header>
  );
}

function IdPill() {
  const { isConnected, chainId } = useAccount();
  const { connectors, connect, isPending } = useConnect();
  const { address, handle } = useAgent();
  const { switchChain } = useSwitchChain();
  if (!isConnected) {
    const c = connectors[0];
    return (
      <button className="btn" style={{ minHeight: 36 }} disabled={isPending || !c} onClick={() => c && connect({ connector: c, chainId: bsc.id })}>
        CONNECT
      </button>
    );
  }
  if (chainId !== bsc.id)
    return (
      <button className="btn outline" style={{ minHeight: 36 }} onClick={() => switchChain({ chainId: bsc.id })}>
        SWITCH TO BSC
      </button>
    );
  return (
    <Link href="/me" className="id-pill" aria-label="Your Agent ID profile">
      <span className="dot" />
      {handle ? `${handle}.ai` : `${address!.slice(0, 6)}…${address!.slice(-4)}`}
    </Link>
  );
}

function MobileMenu({ open, onClose, returnFocus, path }: { open: boolean; onClose: () => void; returnFocus: React.RefObject<HTMLButtonElement>; path: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(open);
  const { isConnected } = useAccount();
  const { connectors, connect } = useConnect();
  const { disconnect } = useDisconnect();
  const { address, handle } = useAgent();
  const { data: rec } = useReadContract({ address: ADDR.arena, abi: arenaAbi, functionName: "record", args: address ? [address] : undefined, query: { enabled: !!address } });

  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    document.body.classList.add("scroll-lock");
    const el = ref.current;
    const focusables = () => Array.from(el?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])") ?? []);
    requestAnimationFrame(() => focusables()[0]?.focus());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "Tab") {
        const f = focusables();
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.classList.remove("scroll-lock");
      returnFocus.current?.focus();
    };
  }, [open, onClose, returnFocus]);

  if (!mounted) return null;
  const tier = rec ? (rec.proWins >= 3 ? "CHAMPION" : rec.rookieWins >= 1 ? "PRO" : "ROOKIE") : "";
  return (
    <>
      {open && <div className="backdrop" onClick={onClose} aria-hidden />}
      <div
        id="mobile-menu"
        ref={ref}
        className={`sheet-right ${open ? "open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        aria-hidden={!open}
        onTransitionEnd={() => !open && setMounted(false)}
        style={{ visibility: open ? "visible" : "hidden" }}
      >
        <div className="row between" style={{ padding: "6px 8px 6px 20px", borderBottom: "1px solid var(--line)" }}>
          <span className="label">MENU</span>
          <button className="btn ghost icon" aria-label="Close menu" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
              <path d="M2 2l12 12M14 2L2 14" stroke="var(--ink)" strokeWidth="2" />
            </svg>
          </button>
        </div>
        <div style={{ padding: 20, borderBottom: "1px solid var(--line)" }}>
          {isConnected && address ? (
            <div className="col gap-4">
              <span className="label sm">AGENT ID</span>
              <span className="mono" style={{ fontSize: 18, fontWeight: 700 }}>
                {handle ? `${handle}.ai` : `${address.slice(0, 6)}…${address.slice(-4)}`}
              </span>
              <span className="mono ink3" style={{ fontSize: 12 }}>
                {rec ? `W ${rec.wins} · L ${rec.losses} · TIER ${tier}` : "…"}
              </span>
              <div className="row" style={{ marginTop: 8 }}>
                <Link href="/me" className="btn outline" style={{ flex: 1 }}>
                  PROFILE
                </Link>
                <button className="btn ghost" onClick={() => disconnect()}>
                  DISCONNECT
                </button>
              </div>
            </div>
          ) : (
            <button className="btn block" onClick={() => connectors[0] && connect({ connector: connectors[0], chainId: bsc.id })}>
              CONNECT WALLET
            </button>
          )}
        </div>
        <nav aria-label="Mobile">
          {NAV.map(([href, label]) => (
            <Link key={href} href={href} aria-current={isActive(path, href) ? "page" : undefined} onClick={onClose}>
              {label}
            </Link>
          ))}
        </nav>
        <div style={{ marginTop: "auto", padding: 20, borderTop: "1px solid var(--line)" }} className="col gap-8">
          <a href={bscscan(ADDR.arena)} target="_blank" rel="noreferrer" className="mono" style={{ fontSize: 12 }}>
            CONTRACTS ON BSCSCAN ↗
          </a>
          <span style={{ fontSize: 12, color: "var(--risk-text)" }}>{RISK}</span>
        </div>
      </div>
    </>
  );
}
