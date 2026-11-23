import { spawnSync } from "node:child_process";
import { cpSync, existsSync, readdirSync, realpathSync, renameSync, rmdirSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

const windows = process.platform === "win32";
const proxyPath = "src/proxy.ts";
const parkedProxyPath = "src/proxy.disabled";
const parkProxy = windows && existsSync(proxyPath);

// Netlify's Windows adapter cannot package the optional Next.js proxy reliably.
// The app's server-rendered pages, actions, and APIs validate owner sessions.
if (parkProxy) {
  if (existsSync(parkedProxyPath)) throw new Error("A previously parked proxy file still exists.");
  renameSync(proxyPath, parkedProxyPath);
}

try {
  const build = spawnSync(process.execPath, ["node_modules/next/dist/bin/next", "build"], {
    env: { ...process.env, TRACKER_NETLIFY_BUILD: "1" },
    stdio: "inherit",
  });
  if (build.error) throw build.error;
  if (build.status !== 0) process.exitCode = build.status ?? 1;
  else if (windows) {
    const standalone = resolve(".next", "standalone");
    const externals = join(standalone, ".next", "node_modules");

    // The adapter's copy step cannot recreate Windows directory junctions.
    // Copy only generated package junctions whose targets are inside this build.
    if (existsSync(externals)) {
      const packages = [externals, ...readdirSync(externals, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && entry.name.startsWith("@"))
        .map((entry) => join(externals, entry.name))];

      for (const directory of packages) {
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
          if (!entry.isSymbolicLink()) continue;
          const filename = join(directory, entry.name);
          const target = realpathSync(filename);
          const pathFromBuild = relative(standalone, target);
          if (!pathFromBuild || pathFromBuild.startsWith("..") || isAbsolute(pathFromBuild)) {
            throw new Error("A standalone dependency points outside its build directory.");
          }
          rmdirSync(filename);
          cpSync(target, filename, { recursive: true, dereference: true });
        }
      }
    }
  }
} finally {
  if (parkProxy) renameSync(parkedProxyPath, proxyPath);
}
