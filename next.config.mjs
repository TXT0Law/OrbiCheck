/** @type {import('next').NextConfig} */
const publicApiOrigin = (process.env.NEXT_PUBLIC_API_URL || "").trim();
const internalApiOrigin = (
  process.env.INTERNAL_API_URL ||
  publicApiOrigin ||
  "http://localhost:8000"
).replace(/\/+$/, "");
const disableApiRewrite = process.env.DISABLE_API_REWRITE === "1";

const nextConfig = {
  output: "standalone",
  // Disable webpack cache to avoid ENOENT pack.gz on external drives
  webpack: (config, { dev }) => {
    if (dev) config.cache = false;
    return config;
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src 'self' http: https: ws: wss:; font-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
        ],
      },
    ];
  },
  async rewrites() {
    if (disableApiRewrite) {
      return [];
    }

    return [
      { source: "/api/v1/:path*", destination: `${internalApiOrigin}/api/v1/:path*` },
    ];
  },
};

export default nextConfig;
