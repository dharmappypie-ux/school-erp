import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

/**
 * The Cloudflare Workers runtime forbids compiling WebAssembly at runtime, but
 * Prisma 7's default (Node) client loads its query compiler that way. So for the
 * Workers build only — gated on PRISMA_EDGE=1, set by the `deploy`/`preview`
 * scripts — we alias the generated client to the `workerd` variant, which
 * imports the wasm compiler as a module. Local dev, `next build`, and the Node
 * scripts keep using the default client.
 */
// Turbopack resolves alias values relative to the project root.
const edgeClient = "./src/generated/prisma-workerd/client.ts";
const useEdgePrisma = process.env.PRISMA_EDGE === "1";

const nextConfig: NextConfig = {
  // Keep native/Node-oriented packages out of the bundle and as runtime
  // requires, so OpenNext's esbuild step doesn't try to resolve `pg`'s optional
  // `pg-cloudflare` socket module at bundle time.
  serverExternalPackages: [
    "pg",
    "pg-cloudflare",
    "@prisma/client",
    "@prisma/adapter-pg",
  ],
  ...(useEdgePrisma
    ? {
        turbopack: {
          resolveAlias: {
            "@/generated/prisma/client": edgeClient,
          },
        },
      }
    : {}),
};

export default nextConfig;

// Wires Cloudflare bindings (env vars, Hyperdrive, R2, …) into `next dev` so
// local development matches the Workers runtime. No-op in the production build.
initOpenNextCloudflareForDev();
