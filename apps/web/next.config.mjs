/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
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
