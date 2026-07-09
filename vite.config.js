import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.js"],
    // The default "forks" pool spawns child processes via child_process.fork,
    // which hangs/times out under process-spawn restrictions (e.g. sandboxed
    // CI runners). "threads" runs tests in-process via worker_threads instead
    // and works the same everywhere.
    pool: "threads",
  },
});
