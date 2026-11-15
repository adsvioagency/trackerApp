import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This app is owner-scoped and almost entirely dynamic; keep rendering predictable.
  cacheComponents: false,
  serverExternalPackages: ["@electric-sql/pglite", "@react-pdf/renderer", "postgres"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  images: { unoptimized: true },
  agentRules: false,
};

export default nextConfig;
