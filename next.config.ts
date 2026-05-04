import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "mariadb", "undici", "ws"],
  allowedDevOrigins: ["lab.notrespond.com", "www.notrespond.com"],
  experimental: {
    serverActions: {
      // Raise the default 4 MB body limit so multipart ticket image
      // uploads (up to 5 × 5 MB files) are not rejected with HTTP 413
      // before the route handler even runs.
      bodySizeLimit: "25mb",
    },
  },
  turbopack: {
    resolveAlias: {
      "@/generated/prisma": "./src/generated/prisma/client.ts",
    },
  },
};

export default nextConfig;
