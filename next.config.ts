import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "mariadb", "undici", "ws"],
  transpilePackages: ["@novnc/novnc"],
  allowedDevOrigins: ["lab.notrespond.com"],
  turbopack: {
    resolveAlias: {
      "@/generated/prisma": "./src/generated/prisma/client.ts",
    },
  },
};

export default nextConfig;
