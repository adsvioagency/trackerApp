import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This app is owner-scoped and almost entirely dynamic; keep rendering predictable.
  cacheComponents: false,
  serverExternalPackages: ["@electric-sql/pglite", "@react-pdf/renderer", "postgres"],
  outputFileTracingExcludes: {
    "/*": ["./data/**/*", "./Adsvio Brand info/**/*", "./.env*"],
  },
  turbopack: {
    resolveAlias: process.env.TRACKER_NETLIFY_BUILD === "1"
      ? { "@/db/embedded": "./src/db/embedded-disabled.ts" }
      : {},
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
