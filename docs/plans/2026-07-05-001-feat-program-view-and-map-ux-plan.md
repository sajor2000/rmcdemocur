---
title: "Program full-curriculum view, map UX redesign, and remaining polish"
date: 2026-07-05
type: feat
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
target_branch: feat/program-view-and-ux-plan (off main)
---

# Program full-curriculum view, map UX redesign, and remaining polish

## Summary
Two altitudes of coverage, plus cleanup. **Course/topic pages** are scoped to that course's organ system(s) — already shipped (`lib/course-scope.ts`). This plan adds the **program / "full curriculum" view** that aggregates *all* courses and measures against the *whole* USMLE/AAMC framework (where the 597-domain / 15-system denominator is correct, because collectively the curriculum should cover everything). It also redesigns the curriculum **map** so it shows alignment instead of three disconnected lists, and clears the remaining P3 polish. Ordered by value: **U1 polish (now)** → **U2 map UX** → **U3 program view**.

## Product Contract
### Requirements
- **R1** A course page measures coverage only against its course's organ scope (done — regression-guard only here).
- **R2** A program-level view measures coverage against the **full** framework, unioning coverage across all courses; program gaps are real gaps.
- **R3** The curriculum map visually communicates *alignment* (curriculum ↔ AAMC ↔ USMLE), not three parallel lists.
- **R4** Remaining audit P3s are resolved (chart labels, landing pseudo-stat, review-progress).
- **AE1** With one course today, the program view must render sensibly (it looks like the course view scaled to the full framework — mostly "not yet covered", honestly).

---

## Implementation Units

### U1. Remaining P3 polish (do now — small, independent)
**Files:** `components/dashboard/MetricCard.tsx` (AamcBarChart), `app/page.tsx` (landing), `components/dashboard/MetricCard.tsx` (AlignmentTable review-progress)
**Work:**
- **Bar-chart labels** — the AAMC bar chart rotates + truncates domain labels ("Knowledge for Prac"). Use full domain names with wrapping or a horizontal bar layout so they're readable.
- **Landing pseudo-stat** — "RMD 563 / Food to Fuel" sits in the numeric stat row as if it were a metric. Move it out (it's the course identity, not a number) or replace the tile with a real 4th metric (e.g. objectives extracted).
- **Review progress** — every alignment shows "Pending"; add an "X of Y reviewed" summary (approved+rejected / total) on the dashboard so the human-review loop shows progress.
**Verification:** labels legible at desktop + mobile widths; landing stat row is all-numeric; dashboard shows a real reviewed count. `npm test` + `tsc` clean.

### U2. Map UX redesign — show alignment, not three lists (R3)
**Files:** `app/courses/[courseId]/map/page.tsx`, `components/map/{CurriculumTree,FrameworkTree,AlignmentDrawer}.tsx`, possibly a new `components/map/AlignmentView.tsx`
**Problem:** today the map is three independent scrolling lists (Rush · AAMC · USMLE) with no visual link; the "tri-directional alignment" is never drawn, and the USMLE column repeats "Human Development —" many times.
**Direction (decision to confirm at build):** pick one of —
- **(a) Selection-linked** (lowest risk): selecting a curriculum chunk highlights the AAMC/USMLE nodes it aligns to (and vice-versa), with connector accents; keep the three columns but make them *react* to each other.
- **(b) Matrix/heatmap** curriculum-section × framework-domain, cells = alignment strength — compact, scannable, scales.
- **(c) Force/sankey graph** of curriculum→framework links — most "map"-like, highest effort.
Recommend **(a)** first (incremental, reuses components), leave (b) as a follow-up. Also collapse the repeated USMLE system prefix into grouped parents.
**Test scenarios:** selecting a GI chunk highlights its AAMC/USMLE alignments; framework node selection highlights aligned chunks; empty selection is neutral; works with the trimmed map payload.
**Verification:** a reviewer can see, for a chunk, which framework nodes it maps to without opening the drawer.

### U3. Program "full curriculum" view (R2, AE1)
**Files (new):** `app/program/page.tsx` (or `/` when multi-course), `lib/queries.ts` `getProgramSummary`, nav entry in `components/layout/Header.tsx`
**Model:** identical shape to `getCourseSummary` but **course-agnostic and unscoped**:
- Denominator = the **full** framework (all 15 USMLE systems / 597 leaf domains, all AAMC competencies) — `courseTargetSystems` is NOT applied here.
- Coverage = union across every course: a system/domain is covered if *any* course covers it.
- Heatmap axis = all 15 systems; a second axis of **courses** (not cases) so you see which course covers which system — the program map.
- Program gaps = full-framework domains no course covers (these are *real* program gaps).
**AE1 (one course today):** with only RMD 563, the program view shows GI/Endocrine/Multisystem covered and the other 12 systems as genuine program gaps — honest and exactly the point ("when we get more" courses, they fill in).
**Test scenarios:** program coverage % = distinct-covered / full-framework total across all courses; adding a second course expands covered systems; heatmap shows courses × systems.
**Verification:** program numbers use the full denominator; course pages stay organ-scoped (both behaviors coexist, driven by which query runs).

---

## Scope Boundaries
**In scope:** U1 now; U2/U3 as the substantive builds. **Deferred:** map option (b)/(c) if (a) ships; keyword-definition payload dedup (separate perf item); multi-course seeding (there is only RMD 563 today — U3 is built now but proves out fully when more courses land).

## Verification Contract
| Gate | Expect |
|------|--------|
| Course pages | stay organ-scoped (regression: RMD 563 = 3 systems, 67 in-scope gaps) |
| Program view | full-framework denominator; union coverage; real program gaps |
| Map | selecting a chunk reveals its framework alignments visually |
| Polish | legible chart labels, all-numeric landing stats, real reviewed count |
| Tests | `npm test` (unit) + `npm run test:e2e` (journeys) green; `tsc` clean |

## Definition of Done
- [ ] U1 polish shipped and verified at desktop + mobile
- [ ] Map communicates alignment (U2 option (a) at minimum)
- [ ] Program view renders full-curriculum coverage/gaps; course pages unchanged
- [ ] e2e extended: a program-view journey + a map-alignment interaction

## Sources
- Two-level IA per user direction (2026-07-05): topic pages scoped, program view full-curriculum.
- Builds on `lib/course-scope.ts`, `getCourseSummary` (organ scoping), and the trimmed map payload (`getMapData`).
- Audit findings: page/journey audit (`docs/plans/2026-07-04-003-...`).
