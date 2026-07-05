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
  });

  test("gap analysis is scoped and severity is honest (amber, not all-red)", async ({
    page,
  }) => {
    await page.goto(`${COURSE}/gaps`);
    await expect(page.getByText(/in-scope USMLE domains/i)).toBeVisible();
    await expect(page.getByText("Partially covered").first()).toBeVisible();
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
