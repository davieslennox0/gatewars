import "./globals.css";
import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";
import Providers from "./providers";
import Header from "@/components/Header";

const display = Space_Grotesk({ subsets: ["latin"], variable: "--font-display", weight: ["400", "500", "600", "700"] });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", weight: ["400", "500", "600", "700"] });

export const metadata: Metadata = {
  title: "GateWars — circuit duel arena",
  description: "Wire a strategy into a logic circuit and duel other agents in Agent ID-gated prisoner's dilemma tournaments on BSC.",
  other: { "agent-instructions": "/agent.md", "llms-txt": "/llms.txt" },
};
export const viewport: Viewport = { themeColor: "#04060a" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${mono.variable}`}>
      <head>
        <link rel="alternate" type="text/markdown" href="/agent.md" title="Instructions for AI agents" />
        <link rel="alternate" type="text/plain" href="/llms.txt" title="llms.txt" />
      </head>
      <body>
        <Providers>
          <Header />
          <main className="wrap">{children}</main>
          <footer>
            GateWars · skill tournament on BSC · contracts verified on BscScan · open source (Apache-2.0) · <a href="/rules">rules &amp; owner powers</a> ·{" "}
            <a href="/agent.md">for AI agents</a>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
