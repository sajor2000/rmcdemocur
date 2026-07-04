---
title: "audit: Page-by-page and user-journey audit of the web app"
date: 2026-07-04
type: audit
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
target_branch: audit/page-journey (off feat/worldclass-chunking-goal-accuracy)
---

# audit: Page-by-page and user-journey audit of the web app

## Summary
Now that the corpus is fully processed (14 docs, ~8,900 alignments, objectives + keyword/figure data surfaced) and the dashboard visuals are wired to real data, do a systematic **verification audit** of every page and every user journey against the live database — confirm each surface renders real, correct data; each journey works end-to-end; and empty/error/loading states degrade gracefully. This is a QA pass, not a feature build: it *drives* the running app, records findings, and each finding becomes a fix.

This audit is the reader-facing counterpart to the earlier data-layer audit (which confirmed queries hit real tables). That one read the code; this one drives the UI.

---

## Method
- **Run the app against live course 1** (`npm run dev`, course seeded, 14 docs processed). Every page is `/courses/1/*` plus `/`, `/about`, `/upload`.
- **Drive each route in a browser** (or the project's browser-test skill): load, read the rendered values, click the interactive elements, and diff what's shown against a direct DB query for the same data (the audit's ground truth).
- **Check three state classes per surface**: (1) **happy** — real data renders correctly; (2) **empty** — a course/section with no data shows an honest empty state, not a crash or fabricated zero; (3) **error/loading** — network failure and in-flight states are handled.
- **Record findings** as `PAGE/JOURNEY — severity — what's wrong — expected` and route real defects to fixes. Capture a screenshot per page for the record.
- **API-level spot check**: hit each `app/api/*` route directly and confirm the payload matches what the page renders (catches page-vs-API drift).

## Actors & journeys (from the product frame)
- **A1 Course director** — opens the map/dashboard/gaps to see where the curriculum covers or misses AAMC/USMLE, exports gaps.
- **A2 Faculty reviewer** — opens a chunk in the map drawer, reads the alignment + rationale + keyword tags + figure, approves/rejects.
- **A3 Pipeline operator** — uploads a document, watches processing, sees it appear on the map.

---

## Implementation Units (audit targets)

### U1. Landing + shell (`/`, Header, Footer, Sidebar, `/about`)
**Files:** `app/page.tsx`, `components/layout/{Header,Footer,Sidebar}.tsx`, `app/about/page.tsx`
**Checks:**
- Landing stat tiles (`getCourseSummary(1)`) show real Guides Processed / AAMC Coverage / USMLE Gaps — cross-check each number against a DB query; confirm the honest "Pending"/"—" fallback appears when the DB is empty (temporarily point at an empty course).
- Sidebar renders the real course code/title/director and the 14-case list; the hardcoded "RMD 563 / Food to Fuel" default only shows on a DB miss.
- Nav links resolve; `/about` static content is accurate (no stale "demo scope" claims now that data is real).
**Test scenarios:** real-data render matches DB; empty-course fallback is honest; nav to each route works.
**Verification:** every landing number equals its DB query; no fabricated values.

### U2. Course dashboard (`/courses/[courseId]`)
**Files:** `app/courses/[courseId]/page.tsx`, `components/dashboard/MetricCard.tsx`, `lib/queries.ts` `getCourseSummary`
**Checks (post-fix regression guard):**
- USMLE **heatmap** now renders the 15 real systems with covered/partial/gap cells (verify against `gap_summary` roll-up) — confirm it is NOT all-red (the bug PR #8 fixed).
- AAMC **bar chart** shows real per-domain coverage % (aligned ÷ total), not `count×12`.
- The three metric cards (AAMC %, USMLE gaps, avg confidence) match DB aggregates.
- Recent Alignments table shows real rows with working framework labels.
**Test scenarios:** heatmap cell distribution matches `gap_summary`; bar % matches `aamc_competencies` coverage; empty course → dashboard's "no data / run bootstrap" state.
**Verification:** heatmap + bars vary and match DB; regression PR #8 held.

### U3. Curriculum map + alignment drawer (`/courses/[courseId]/map`)
**Files:** `app/courses/[courseId]/map/page.tsx`, `components/map/{CurriculumTree,FrameworkTree,AlignmentDrawer}.tsx`, `app/api/courses/[courseId]/map/route.ts`, `app/api/alignments/[alignmentId]/route.ts`, `app/api/media/[assetId]/route.ts`
**Checks:**
- Curriculum tree + both framework trees render; confidence/case/framework filters actually narrow the set.
- Drawer (A2 journey): excerpt + rationale + confidence + status render from real alignment; **keyword tag chips + definitions** show (PR #10); **figure thumbnails** render for the 9 answer-image chunks (post relink) and the "image not extracted" note for the rest.
- Approve/Reject → `PATCH /api/alignments/[id]` actually updates `alignments.status` (verify in DB); drawer reflects the new status.
**Test scenarios:** a GI chunk shows topical alignments + keyword chips; a figure-linked chunk shows a thumbnail; approve persists to DB; filters compose correctly; chunk with no media/keywords hides those sections.
**Verification:** drawer data matches DB; status write persists; thumbnails load via `/api/media`.

### U4. Gap analysis + export (`/courses/[courseId]/gaps`)
**Files:** `app/courses/[courseId]/gaps/page.tsx`, `lib/queries.ts` `getGapExportRows`, `lib/gap-analyzer.ts` `suggestedGapAction`, `app/api/courses/[courseId]/export/route.ts`
**Checks:**
- Summary sentence + gap cards + coverage table reflect the real 735 covered / 349 partial / 216 gap breakdown.
- Suggested gap actions are sensible for real gap rows.
- CSV export downloads and its rows match the table + DB.
**Test scenarios:** coverage counts match `gap_summary`; CSV content matches; a fully-covered framework shows no false gaps.
**Verification:** on-screen + CSV both equal the DB gap rollup.

### U5. Learning objectives (`/courses/[courseId]/objectives`)
**Files:** `app/courses/[courseId]/objectives/page.tsx`, `components/.../ObjectivesExplorer`, `lib/queries.ts` `getCourseObjectivesSummary`, `app/api/courses/[courseId]/objectives/route.ts`
**Checks (post PR #9):**
- Totals + regex-vs-LLM split + by-case table reflect the real 72 objectives across the 7 self-study guides — **including Case 3 now (1) and Case 2 (17)**.
- The "LLM never fabricates" claim is honest against `extraction_method`.
- Faculty guides correctly show 0 objectives (not an error).
**Test scenarios:** objective counts match DB per case; Case 3 appears; extraction-method split is accurate.
**Verification:** page objectives == `course_objectives` rows.

### U6. Search (`/courses/[courseId]/search`)
**Files:** `app/courses/[courseId]/search/page.tsx`, `app/api/search/route.ts`, `lib/queries.ts` `searchChunks`
**Checks:**
- On-topic query returns topical chunks above the `SEARCH_MIN_SIMILARITY=0.42` floor with a synthesized answer.
- **Off-topic query degrades to the low-confidence path** (best-effort + note), not five forced hits — the behavior the threshold calibration targets.
- Example prompt chips run; result cards show real excerpts/citations.
**Test scenarios:** "arterial supply of the foregut" → relevant hits; "how to refinance a mortgage" → low-confidence note; empty query handled.
**Verification:** search results + floor behavior match the calibrated thresholds.

### U7. Upload + processing (`/upload`, A3 journey)
**Files:** `app/upload/page.tsx`, `components/upload/{DropZone,ProcessingStatus}.tsx`, `app/api/upload/route.ts`, `app/api/upload/[jobId]/{advance,stream}/route.ts`
**Checks:**
- DropZone accepts a file → `POST /api/upload` creates `documents` + `processing_jobs` rows.
- ProcessingStatus SSE stream reflects real job stage/progress from `processing_jobs`.
- The "sample cases" card is clearly labeled illustrative (intentional demo) and feeds no live metric.
- After processing, the new doc appears on the map/dashboard.
**Test scenarios:** upload creates job rows; stream advances stages; a failed/oversized file surfaces an error, not a silent hang.
**Verification:** job orchestration reflects real DB state end-to-end.

### U8. Cross-cutting + orphans
**Files:** `app/api/align/route.ts`, auth (`lib/api-auth.ts` / `middleware.ts`), all pages
**Checks:**
- **`/api/align`** — the earlier audit flagged it as not called by any UI. Confirm it's a dev/debug endpoint; either wire it or document/remove it.
- Auth: with `API_SECRET` set, `/api/*` requires the HMAC session; browser flows still work; unset = open (dev).
- Loading/error/empty states on every page; responsive at mobile + desktop widths; no text overflow; no console errors.
**Test scenarios:** `/api/align` disposition decided; auth on/off both work; each page's error boundary renders on a forced fetch failure.
**Verification:** no orphaned/broken surface; auth + states behave.

---

## Scope Boundaries
**In scope:** verification of existing pages/journeys against live data; fixes for defects found.
### Deferred to Follow-Up Work
- New features surfaced by the audit (e.g., figure_captions UI once populated, map keyword filter) — file separately, don't fold into the audit.
- Automated end-to-end (Playwright) journey tests — the audit is manual/driven first; codify the highest-value journeys as tests after.

---

## Verification Contract
| Gate | Method | Expect |
|------|--------|--------|
| Data fidelity | Each page value vs a direct DB query | Match, no fabricated numbers |
| Journey completeness | Drive A1/A2/A3 end-to-end | Each completes; writes persist |
| State handling | Force empty / error / loading per page | Honest, no crash |
| Regression | Dashboard heatmap + bars (PR #8), objectives (PR #9), keyword/figure (PR #10) | Hold against live data |
| Auth | `API_SECRET` set/unset | Enforced / open respectively |

## Definition of Done
- [ ] All 8 pages + 3 journeys driven against live course 1; findings recorded with screenshots
- [ ] Every rendered metric cross-checked against a DB query
- [ ] Empty/error/loading verified per page
- [ ] Real defects fixed (or filed if out of audit scope); `/api/align` disposition decided
- [ ] Highest-value journeys earmarked for Playwright follow-up

---

## Sources & Research
- Earlier data-layer UI audit (this session): mapped every page to its query/table; found + fixed the heatmap (all-red) and AAMC bar (count×12) — PR #8.
- `lib/queries.ts` (data layer), `app/**/page.tsx`, `app/api/**/route.ts`, `components/{map,dashboard,upload,layout}/*`.
- Live DB course 1: 14 docs, ~8,900 alignments, 735/349/216 gap split, 72 objectives, 9 figure-linked chunks, keyword tags on all chunks.
