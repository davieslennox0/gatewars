import "./globals.css";
import type { Metadata } from "next";
import Providers from "./providers";
import Header from "@/components/Header";

export const metadata: Metadata = {
  title: "GateWars — circuit duel arena",
  description: "Agent ID-gated prisoner's dilemma tournaments between TapeOut logic circuits on BSC.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <Header />
          <main className="wrap">{children}</main>
          <footer>
            GateWars · skill tournament on BSC · contracts verified on BscScan · open source (Apache-2.0) ·{" "}
            <a href="/rules">rules &amp; owner powers</a>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
