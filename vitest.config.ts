import { defineConfig, configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    // Playwright e2e specs live in e2e/ and must not be run by vitest.
    // .claude/** excludes any nested Claude Code agent worktrees (unrelated
    // checkouts of other branches) from test discovery.
    exclude: [...configDefaults.exclude, "e2e/**", ".claude/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
