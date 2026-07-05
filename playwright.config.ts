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
  expect: {
    timeout: 15_000,
    toHaveScreenshot: {
      // Real DB-driven numbers can drift slightly between runs; a small
      // pixel-ratio tolerance absorbs anti-aliasing noise without masking a
      // real regression. Animations disabled by default (KTD7) so a
      // transition mid-capture can't produce a flaky diff.
      maxDiffPixelRatio: 0.02,
      animations: "disabled",
    },
  },
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", testMatch: /journeys\.spec\.ts$/, use: { ...devices["Desktop Chrome"] } },
    {
      name: "Mobile",
      testMatch: /visual\.spec\.ts$/,
      use: { viewport: { width: 390, height: 844 } },
    },
    {
      name: "Desktop",
      testMatch: /visual\.spec\.ts$/,
      use: { viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
