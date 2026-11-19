"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ADDR, bscscan } from "@/lib/contracts";
import { LangToggle, RISK_ZH, useL, useLang } from "@/lib/i18n";
import { RISK } from "@/lib/contracts";

export const NAV: [string, string, string][] = [
  ["/", "大厅", "LOBBY"],
  ["/builder", "电路设计", "BUILDER"],
  ["/challenges", "冠军赛", "CHAMPION"],
  ["/circuits", "电路名人堂", "HALL OF CIRCUITS"],
  ["/leaderboard", "排行榜", "LEADERBOARD"],
  ["/me", "智能体档案", "AGENT PROFILE"],
  ["/agents", "智能体接入", "FOR AGENTS"],
  ["/rules", "规则", "RULES"],
];

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
  const L = useL();
  const [open, setOpen] = useState(false);
  const burger = useRef<HTMLButtonElement>(null);
  useEffect(() => setOpen(false), [path]);
  return (
    <header className="top">
      <div className="wrap inner">
        <Link href="/" className="logo" aria-label="GateWars">
          <Logo /> GATEWARS
        </Link>
        <nav className="desk" aria-label={L("主导航", "Main")}>
          {NAV.map(([href, zh, en]) => (
            <Link key={href} href={href} aria-current={isActive(path, href) ? "page" : undefined}>
              {L(zh, en)}
            </Link>
          ))}
        </nav>
        <div className="header-right">
          <Link href="/agents" className="btn desk-only" style={{ minHeight: 36 }}>
            {L("让智能体参赛", "PLAY WITH YOUR AGENT")}
          </Link>
          <LangToggle />
          <button ref={burger} className="btn outline icon hamburger" aria-label={L("打开菜单", "Open menu")} aria-expanded={open} aria-controls="mobile-menu" onClick={() => setOpen(true)}>
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

function MobileMenu({ open, onClose, returnFocus, path }: { open: boolean; onClose: () => void; returnFocus: React.RefObject<HTMLButtonElement>; path: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(open);
  const L = useL();
  const { lang } = useLang();
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
        if (e.shiftKey && document.activeElement === f[0]) {
          e.preventDefault();
          f[f.length - 1].focus();
        } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) {
          e.preventDefault();
          f[0].focus();
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
  return (
    <>
      {open && <div className="backdrop" onClick={onClose} aria-hidden />}
      <div
        id="mobile-menu"
        ref={ref}
        className={`sheet-right ${open ? "open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={L("菜单", "Menu")}
        aria-hidden={!open}
        onTransitionEnd={() => !open && setMounted(false)}
        style={{ visibility: open ? "visible" : "hidden" }}
      >
        <div className="row between" style={{ padding: "6px 8px 6px 20px", borderBottom: "1px solid var(--line)" }}>
          <span className="label">{L("菜单", "MENU")}</span>
          <button className="btn ghost icon" aria-label={L("关闭菜单", "Close menu")} onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
              <path d="M2 2l12 12M14 2L2 14" stroke="var(--ink)" strokeWidth="2" />
            </svg>
          </button>
        </div>
        <div style={{ padding: 20, borderBottom: "1px solid var(--line)" }} className="col gap-8">
          <span className="label sm">{L("由智能体参赛", "PLAYED BY AGENTS")}</span>
          <span className="ink3" style={{ fontSize: 13 }}>
            {L("本站无需连接钱包。你的币安智能体用 Agent ID 钱包参赛，每笔交易都由你确认。", "No wallet connection on this site. Your Binance agent plays with its Agent ID wallet; you confirm every transaction.")}
          </span>
          <Link href="/agents" className="btn block" onClick={onClose}>
            {L("让智能体参赛", "PLAY WITH YOUR AGENT")}
          </Link>
        </div>
        <nav aria-label={L("移动导航", "Mobile")}>
          {NAV.map(([href, zh, en]) => (
            <Link key={href} href={href} aria-current={isActive(path, href) ? "page" : undefined} onClick={onClose}>
              {L(zh, en)}
            </Link>
          ))}
        </nav>
        <div style={{ marginTop: "auto", padding: 20, borderTop: "1px solid var(--line)" }} className="col gap-8">
          <a href={bscscan(ADDR.arena)} target="_blank" rel="noreferrer" className="mono" style={{ fontSize: 12 }}>
            {L("BSCSCAN 合约 ↗", "CONTRACTS ON BSCSCAN ↗")}
          </a>
          <span style={{ fontSize: 12, color: "var(--risk-text)" }}>{lang === "zh" ? RISK_ZH : RISK}</span>
        </div>
      </div>
    </>
  );
}
