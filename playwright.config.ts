import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";
import fs from "fs";

// E2E journey tests run against a dev server backed by a populated database.
// They are separate from the vitest unit suite (`npm test`) — run with
// `npm run test:e2e`. Load .env.local so the tests and the dev server both see
// DATABASE_URL (the specs self-skip when it is absent).
for (const f of [".env.local", ".env"]) {
  if (fs.existsSync(f)) loadEnv({ path: f, override: false });
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  // The curriculum map fetches a large client-side payload; give assertions room.
  expect: { timeout: 15_000 },
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
