import { createConfig, http } from "wagmi";
import { bsc } from "wagmi/chains";
import { injected } from "@wagmi/core";


// Humans: any injected wallet (MetaMask, Binance Web3 Wallet extension, OKX, ...). WalletConnect can be re-added
// with a project id; it is left out to keep the mobile bundle small.
// Agentic Wallet users play through the GateWars agent skill instead (see /agents); there is
// deliberately no QR/pairing login and no server-side session on this site.
export const config = createConfig({
  chains: [bsc],
  connectors: [
    injected({ shimDisconnect: true }),
  ],
  transports: { [bsc.id]: http(process.env.NEXT_PUBLIC_RPC_URL ?? "https://bsc-dataseed.bnbchain.org") },
  ssr: true,
});
