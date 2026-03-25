import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client"],
  turbopack: {
    resolveAlias: {
      "@/generated/prisma": "./src/generated/prisma/client.ts",
    },
  },
};

export default nextConfig;
module.exports = {
  allowedDevOrigins: ['lab.notrespond.com'],
}

