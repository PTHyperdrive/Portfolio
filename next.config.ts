import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "mariadb", "undici", "ws"],
  allowedDevOrigins: ["lab.notrespond.com", "www.notrespond.com"],
  turbopack: {
    resolveAlias: {
      "@/generated/prisma": "./src/generated/prisma/client.ts",
    },
  },
};

export default nextConfig;
