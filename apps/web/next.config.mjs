/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@gatewars/compiler"],
  webpack: (config) => {
    // wagmi/walletconnect optional peer deps not needed in the browser bundle
    config.externals.push("pino-pretty", "lokijs", "encoding");
    return config;
  },
};
export default nextConfig;
