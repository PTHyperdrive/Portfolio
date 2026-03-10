import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "mariadb"],
  turbopack: {
    resolveAlias: {
      "@/generated/prisma": "./src/generated/prisma/index.js",
    },
  },
};

export default nextConfig;
