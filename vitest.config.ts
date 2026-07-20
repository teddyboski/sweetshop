import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";
import { config } from "dotenv";

config({ path: ".env.local" });

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx", "tests/integration/**/*.test.ts"],
    globals: true,
    // Integration tests hit a real, shared, free-tier Supabase project (project
    // convention: never mock the DB). Running test files in parallel workers
    // caused proven read-after-write inconsistency under concurrent load
    // (writes confirmed succeeding via 201 responses, but an immediate
    // subsequent read from a different worker came back empty) - not an
    // application bug. Disabling cross-file parallelism eliminates that whole
    // class of flake; unit tests are cheap enough that running them serially
    // too costs negligible time.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "server-only": path.resolve(__dirname, "./tests/mocks/server-only-stub.ts"),
    },
  },
});