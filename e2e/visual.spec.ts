import { test, expect } from "@playwright/test";

// Visual-regression baselines across all 9 routes, run at both the Mobile and
// Desktop projects (playwright.config.ts). Separate from journeys.spec.ts's
// behavioral assertions — this suite only checks pixels. Needs a populated DB.
test.beforeEach(() => {
  test.skip(
    !process.env.DATABASE_URL,
    "visual regression needs a populated database (run the db:* bootstrap chain)",
  );
});

const ROUTES: { name: string; path: string }[] = [
  { name: "landing", path: "/" },
  { name: "about", path: "/about" },
  { name: "upload", path: "/upload" },
  { name: "program", path: "/program" },
  { name: "course-dashboard", path: "/courses/1" },
  { name: "course-gaps", path: "/courses/1/gaps" },
  { name: "course-map", path: "/courses/1/map" },
  { name: "course-objectives", path: "/courses/1/objectives" },
  { name: "course-search", path: "/courses/1/search" },
];

for (const route of ROUTES) {
  test(`${route.name} matches its baseline`, async ({ page }) => {
    // The curriculum map fetches a large client-side payload (same note as
    // journeys.spec.ts); give it room before the screenshot times out.
    if (route.name === "course-map") test.setTimeout(90_000);

    await page.goto(route.path);
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot(`${route.name}.png`, {
      fullPage: true,
      // Recharts' SVG bars re-render with tiny sub-pixel anti-aliasing jitter
      // between identical draws (verified: only source of diff on an
      // unmodified page) — mask it rather than loosen the tolerance that
      // catches real text/layout regressions everywhere else (KTD7).
      // [data-mask="dynamic"] covers the other DB-driven regions that can
      // change independently of a code change (human review progress,
      // recent alignments) — same rationale, not tied to a specific chart.
      mask: [page.locator(".recharts-wrapper"), page.locator('[data-mask="dynamic"]')],
    });
  });
}
