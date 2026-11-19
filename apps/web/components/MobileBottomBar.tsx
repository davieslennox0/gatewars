"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useQuotes } from "@/lib/data";
import EntrySheet from "./EntrySheet";

/** Mobile only (< 960px): builder shortcut + primary "ENTER ROOKIE · $1" opening the entry sheet. */
export default function MobileBottomBar() {
  const [open, setOpen] = useState(false);
  const { data: q } = useQuotes();
  const path = usePathname();
  if (path.startsWith("/agents") || path.startsWith("/rules")) return null;
  const usd = q ? `$${(Number(q[0].usd) / 1e8).toFixed(0)}` : "$1";
  return (
    <>
      <div className="bottombar mob-only">
        <Link href="/builder" className="btn outline icon" aria-label="Open the circuit builder">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
            <rect x="4" y="4" width="12" height="12" rx="1" stroke="var(--ink)" strokeWidth="1.5" />
            <path d="M7 1v3M10 1v3M13 1v3M7 16v3M10 16v3M13 16v3M1 7h3M1 10h3M1 13h3M16 7h3M16 10h3M16 13h3" stroke="var(--pin)" strokeWidth="1.5" />
          </svg>
        </Link>
        <button className="btn primary" onClick={() => setOpen(true)}>
          ENTER ROOKIE · {usd}
        </button>
      </div>
      <EntrySheet open={open} onClose={() => setOpen(false)} tier={0} />
    </>
  );
}
