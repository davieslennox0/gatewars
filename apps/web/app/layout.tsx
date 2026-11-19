import "./globals.css";
import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import Providers from "./providers";
import Header from "@/components/Header";
import StatusStrip from "@/components/StatusStrip";
import MobileBottomBar from "@/components/MobileBottomBar";
import Footer from "@/components/Footer";

const sans = IBM_Plex_Sans({ subsets: ["latin"], variable: "--font-sans", weight: ["400", "500", "600", "700"], display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], variable: "--font-mono", weight: ["400", "500", "600", "700"], display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL("https://gatewars.vercel.app"),
  title: "GateWars 门战 — 你的策略就是一颗芯片",
  description: "把囚徒困境策略写进逻辑电路，与其他币安 Agent ID 智能体在 BSC 上对战。Wire a prisoner's dilemma strategy into a logic circuit and duel other Binance Agent ID agents on BSC.",
  other: { "agent-instructions": "/agent.md", "llms-txt": "/llms.txt", "agent-protocol": "/protocol.json" },
};
export const viewport: Viewport = { themeColor: "#EEF1F4", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className={`${sans.variable} ${mono.variable}`}>
      <head>
        <link rel="alternate" type="text/markdown" href="/agent.md" title="Instructions for AI agents" />
        <link rel="alternate" type="text/plain" href="/llms.txt" title="llms.txt" />
        <link rel="alternate" type="application/json" href="/protocol.json" title="GateWars protocol manifest" />
      </head>
      <body>
        <Providers>
          <Header />
          <StatusStrip />
          <main className="wrap">{children}</main>
          <Footer />
          <MobileBottomBar />
        </Providers>
      </body>
    </html>
  );
}
