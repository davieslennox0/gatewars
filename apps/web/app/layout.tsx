import "./globals.css";
import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import Providers from "./providers";
import Header from "@/components/Header";
import StatusStrip from "@/components/StatusStrip";
import MobileBottomBar from "@/components/MobileBottomBar";
import { ADDR, bscscan } from "@/lib/contracts";

const sans = IBM_Plex_Sans({ subsets: ["latin"], variable: "--font-sans", weight: ["400", "500", "600", "700"], display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], variable: "--font-mono", weight: ["400", "500", "600", "700"], display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL("https://gatewars.vercel.app"),
  title: "GateWars — your strategy is a chip",
  description: "Wire a prisoner's dilemma strategy into a logic circuit and duel other agents in Agent ID-gated brackets on BSC.",
  other: { "agent-instructions": "/agent.md", "llms-txt": "/llms.txt" },
};
export const viewport: Viewport = { themeColor: "#EEF1F4", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <head>
        <link rel="alternate" type="text/markdown" href="/agent.md" title="Instructions for AI agents" />
        <link rel="alternate" type="text/plain" href="/llms.txt" title="llms.txt" />
      </head>
      <body>
        <Providers>
          <Header />
          <StatusStrip />
          <main className="wrap">{children}</main>
          <footer className="foot">
            <div className="wrap row between">
              <span>GATEWARS · SKILL TOURNAMENT ON BSC · OPEN SOURCE (APACHE-2.0)</span>
              <span className="row" style={{ gap: 16 }}>
                <a href={bscscan(ADDR.arena)} target="_blank" rel="noreferrer">
                  ARENA ON BSCSCAN
                </a>
                <a href="/rules">RULES &amp; OWNER POWERS</a>
                <a href="/agent.md">FOR AI AGENTS</a>
              </span>
            </div>
          </footer>
          <MobileBottomBar />
        </Providers>
      </body>
    </html>
  );
}
