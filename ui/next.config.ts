import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ui/ has its own package-lock.json (a separate npm project, deliberately
  // not part of the root workspace) but sits inside the root repo, which
  // also has a lockfile -- this pins Turbopack's root to ui/ itself so it
  // stops guessing between the two.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
