import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // Point nft tracer at the monorepo root so all hoisted node_modules are traced
  outputFileTracingRoot: path.join(__dirname, "../../"),
  basePath: "/mai0.1",
  assetPrefix: "/mai0.1",
  async rewrites() {
    return [
      {
        source: "/mai0.1/api/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/api/:path*`
      }
    ];
  }
};

export default nextConfig;
