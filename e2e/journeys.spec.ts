import { test, expect } from "@playwright/test";

// The three product journeys (course director, faculty reviewer, operator) plus
// the responsive shell, driven end-to-end against live course 1. These lock the
// audit fixes: organ-scoped coverage, honest gap severity, no leaked dev copy on
// the map, and the mobile drawer. They need a populated DB — skip without one.
test.beforeEach(() => {
  test.skip(
    !process.env.DATABASE_URL,
    "e2e journeys need a populated database (run the db:* bootstrap chain)",
  );
});

const COURSE = "/courses/1";

test.describe("A1 — course director reviews coverage", () => {
  test("dashboard scopes USMLE coverage to the course's organ systems", async ({
    page,
  }) => {
    await page.goto(COURSE);
    await expect(
      page.getByRole("heading", { name: "Course Dashboard" }),
    ).toBeVisible();
    // Organ-scope framing (the shipped feature), not the whole-framework story.
    await expect(page.getByText(/scoped to this course/i)).toBeVisible();
    await expect(page.getByText("In-Scope USMLE Gaps")).toBeVisible();
    // Heatmap is limited to the target systems — an out-of-scope system is absent.
    // "Endocrine System" appears in both the scope note and a heatmap row.
    await expect(page.getByText("Endocrine System").first()).toBeVisible();
    await expect(page.getByText("Behavioral Health")).toHaveCount(0);
    // AE1 (no PR #8 all-red regression): the heatmap must show a real mix of
    // cell statuses, not every cell rendering as "gap". Each cell's title
    // attribute is "Case N — System: <status>" (components/dashboard/
    // MetricCard.tsx); a residual gap this asserts at the e2e level, not
    // just via the lib/queries.ts unit tests.
    // title^="Case " disambiguates heatmap cells from the intensity bar's
    // segments just above them, which also embed " — " and ":" in their titles.
    const cells = page.locator('[title^="Case "]');
    const statuses = await cells.evaluateAll((els) =>
      els.map((el) => el.getAttribute("title")?.split(": ").pop()),
    );
    expect(statuses.length).toBeGreaterThan(0);
    expect(new Set(statuses).size).toBeGreaterThan(1);
  });

  test("gap analysis is scoped and speaks one coverage methodology", async ({
    page,
  }) => {
    await page.goto(`${COURSE}/gaps`);
    await expect(page.getByText(/in-scope USMLE domains/i)).toBeVisible();
    // One vocabulary, not a "per-document snapshot" vs "authoritative" split —
    // the intensity spectrum and the gap cards below it use the same levels.
    await expect(page.getByText(/How coverage is measured/i)).toBeVisible();
    await expect(page.getByText("Introduced").first()).toBeVisible();
  });
});

test.describe("A2 — faculty reviewer opens the map", () => {
  test("curriculum map loads and never leaks a dev message", async ({ page }) => {
    // The map fetches a large (multi-MB) client payload, so allow generous time.
    test.setTimeout(90_000);
    await page.goto(`${COURSE}/map`);
    await expect(
      page.getByRole("heading", { name: "Curriculum Map" }),
    ).toBeVisible();
    // The old loading state leaked "Connect DATABASE_URL / run seed" to users.
    await expect(page.getByText(/DATABASE_URL/)).toHaveCount(0);
    await expect(page.getByText("AAMC Standards")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("USMLE 2025")).toBeVisible({ timeout: 60_000 });
  });
});

test.describe("A3 — operator uploads a guide", () => {
  test("upload page offers the dropzone with honest sample labeling", async ({
    page,
  }) => {
    await page.goto("/upload");
    await expect(
      page.getByText(/Drag and drop faculty guides/i),
    ).toBeVisible();
    await expect(page.getByText(/illustrative only/i)).toBeVisible();
  });
});

test.describe("responsive shell", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("mobile collapses the sidebar into a drawer", async ({ page }) => {
    await page.goto(COURSE);
    const menu = page.getByRole("button", {
      name: /open course navigation/i,
    });
    await expect(menu).toBeVisible();
    await menu.click();
    await expect(
      page.getByRole("link", { name: "Learning Objectives" }),
    ).toBeVisible();
  });
});

test.describe("A4 — program coverage (intensity model)", () => {
  test("program view shows both spectra, the method box, scope selector, and exports", async ({
    page,
  }) => {
    await page.goto("/program");
    await expect(
      page.getByRole("heading", { name: /Program Curriculum Coverage/i }),
    ).toBeVisible();
    // R6 method transparency + both frameworks + scope + download.
    await expect(page.getByText(/How coverage is measured/i)).toBeVisible();
    await expect(page.getByText(/USMLE coverage/i).first()).toBeVisible();
    await expect(page.getByText(/AAMC coverage/i).first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Entire curriculum" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /CSV \(spreadsheet\)/i }).first()).toBeVisible();
  });

  test("coverage dataset export is a CSV led by the method note", async ({ request }) => {
    const res = await request.get("/api/program/export?format=csv");
    expect(res.ok()).toBeTruthy();
    const body = await res.text();
    expect(body).toContain("framework,system,topic,level,documents,courses");
    expect(body).toMatch(/faculty review/i);
  });

  test("course dashboard speaks the same intensity vocabulary", async ({ page }) => {
    await page.goto(COURSE);
    await expect(page.getByText(/Coverage intensity/i)).toBeVisible();
    await expect(page.getByText(/How coverage is measured/i).first()).toBeVisible();
  });
});

test.describe("A5 — learning objectives export", () => {
  test("objectives page shows download links", async ({ page }) => {
    await page.goto(`${COURSE}/objectives`);
    await expect(
      page.getByRole("heading", { name: "Learning Objectives", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /CSV \(spreadsheet\)/i })).toBeVisible();
  });

  test("course objectives CSV is led by the method note and header columns", async ({
    request,
  }) => {
    const res = await request.get("/api/courses/1/objectives/export?format=csv");
    expect(res.ok()).toBeTruthy();
    const body = await res.text();
    expect(body).toMatch(/extracted directly/i);
    expect(body).toContain("objective,section,extraction_method");
    expect(body).toContain("source_excerpt");
  });
});
