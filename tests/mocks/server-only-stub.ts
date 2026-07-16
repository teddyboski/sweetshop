// Stub for the `server-only` package, used only inside the Vitest test
// runner (aliased via vitest.config.ts). Next.js's real build pipeline
// still uses the genuine `server-only` package and its client-import
// guard is untouched in production; this stub exists purely because
// Vitest doesn't run Next.js's bundler, which is what normally strips
// this import safely on the server.
export {};
