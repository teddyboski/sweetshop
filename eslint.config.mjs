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
    "**/.next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Git worktrees (nested copies of the repo, not source to lint):
    ".claude/worktrees/**",
    // Self-contained Expo/React Native project with its own lint/type
    // setup - not part of the Next.js app being linted here.
    "mobile/**",
  ]),
]);

export default eslintConfig;
