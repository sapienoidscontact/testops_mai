import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // Use the project dir as tracing root so nft traces apps/web/node_modules
  // and server.js lands at standalone/server.js (not standalone/apps/web/server.js)
  outputFileTracingRoot: __dirname,
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
