import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // use the compiler package straight from TypeScript source (no separate build step on Vercel)
    config.resolve.alias["@gatewars/compiler"] = path.resolve(here, "../../packages/compiler/src/index.ts");
    config.resolve.extensionAlias = { ".js": [".ts", ".js"] };
    // optional peer deps of wallet libraries not needed in the browser bundle
    config.externals.push("pino-pretty", "lokijs", "encoding");
    return config;
  },
};
export default nextConfig;
