import { createConfig, http } from "wagmi";
import { bsc } from "wagmi/chains";
import { injected } from "@wagmi/core";
import { walletConnect } from "wagmi/connectors";

const wc = process.env.NEXT_PUBLIC_WC_PROJECT_ID;

// Humans: any injected wallet (MetaMask, Binance Web3 Wallet extension, ...) or WalletConnect.
// Agentic Wallet users play through the GateWars agent skill instead (see /agents); there is
// deliberately no QR/pairing login and no server-side session on this site.
export const config = createConfig({
  chains: [bsc],
  connectors: [
    injected({ shimDisconnect: true }),
    ...(wc ? [walletConnect({ projectId: wc, showQrModal: true, metadata: { name: "GateWars", description: "Circuit duel arena", url: "https://gatewars.vercel.app", icons: [] } })] : []),
  ],
  transports: { [bsc.id]: http(process.env.NEXT_PUBLIC_RPC_URL ?? "https://bsc-dataseed.bnbchain.org") },
  ssr: true,
});
