import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Nested build output and agent worktrees: the top-level `.next/**` glob
    // does not match a `.next` dir sitting under `.claude/worktrees/*`, so a
    // background agent's build output would otherwise be linted.
    "**/.next/**",
    ".claude/**",
    "src/generated/**",
    // Cloudflare / OpenNext build output.
    ".open-next/**",
    ".wrangler/**",
  ]),
]);

export default eslintConfig;
