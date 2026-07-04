---
title: "fix: Complete curriculum objective extraction across all guides"
date: 2026-07-04
type: fix
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
target_branch: fix/objectives-extraction-coverage (stacked on feat/worldclass-chunking-goal-accuracy)
---

# fix: Complete curriculum objective extraction across all guides

## Summary
"Extract all curriculum objectives" is a core pillar of this curriculum-audit app, but only 6 of 14 documents currently yield objectives and **Case 3 self-study extracts zero**. Root cause is identified: the extractor treats `TO-####` (topic-objective) coded lines as *section-end markers*, so Case 3's objectives — a "Self-Study Topics:" list where every item is `TO-####` coded — terminate the objectives section instead of being captured. Fix the section-body parsing to recognize topic-objective lists inside an objectives section, add a coverage audit, and re-run extraction to backfill the DB.

---

## Problem Frame
`lib/objective-extractor.ts` finds an objectives section by heading (`OBJECTIVE_SECTION_PATTERNS`, e.g. `Case Specific Objectives`), then walks lines until a `SECTION_END_PATTERNS` match, keeping lines that `looksLikeObjective`. Two coupled issues:

1. **`TO-####` lines are section-enders, not objectives.** `SECTION_END_PATTERNS` (`lib/objective-extractor.ts:46`) matches `^[A-Z]...\(TO-\d{4}\)$`. Case 3 self-study's objectives *are* that shape: under `Case Specific Objectives` (line ~8972) sits a notes preamble, then `Self-Study Topics:` and items like `Posterior Abdominal Wall Contents (TO-0010)`. The first `TO-####` line ends the section → **0 objectives captured**.
2. **Only `EO-####` is treated as an objective code.** `EO_CODE_PATTERN` (`:94`) recognizes only educational-objective codes, so `TO-####` items are never validated as objectives even if reached.

Confirmed live: Cases 1/2/4/5/6/7 self-study extract 33/14/5/11/3/2; Case 3 self-study = 0; faculty guides = 0 (expected — faculty guides carry answer keys, not student objectives).

### Requirements
- R1. Every self-study guide that contains an objectives/topics section yields ≥1 objective — specifically Case 3 self-study yields its `Self-Study Topics` list.
- R2. `TO-####` topic-objective items inside an objectives section are captured as objectives (with `eoCode` populated by the `TO-####` value), not treated as section boundaries.
- R3. **No regression** for the 6 documents that already extract correctly — their counts and content stay identical.
- R4. A coverage audit reports objectives-per-document across all 14 files and can gate on "every self-study guide > 0".
- R5. Re-running extraction backfills the DB so the Objectives page reflects the newly-covered documents (Case 3 at minimum).

### Acceptance Examples
- AE1. Extractor on Case 3 self-study returns objectives for the `Self-Study Topics` items, each carrying its `TO-####` code.
- AE2. Extractor on Case 5 self-study returns the **same** objectives it does today (regression lock).
- AE3. Coverage audit lists 14 rows; all 7 self-study guides show a nonzero count.

---

## Planning Contract

### Key Technical Decisions
- **KTD1 — Characterization-first on a legacy parser.** Lock the current extraction output for the working documents (and the empty Case 3) *before* changing patterns, so the `TO-####` change is proven not to regress Cases 1/2/4/5/6/7. This parser is heuristic and fragile; behavior must be pinned first.
- **KTD2 — Context-gate the `TO-####` reclassification.** A `TO-####` line ends a section in some documents but *is* an objective in Case 3. Disambiguate by context: once inside a recognized objectives section and after a topics sub-header (e.g. `Self-Study Topics:`), treat `TO-####` lines as objectives rather than as an end marker. Do not globally remove the end pattern — that would over-capture in documents where `TO-####` legitimately marks a following (non-objective) section.
- **KTD3 — Reuse the existing `eoCode` column for `TO-####`.** `course_objectives.eoCode` already stores the objective code; store `TO-####` there. No schema change.
- **KTD4 — Backfill via the existing script, not a full reprocess.** `scripts/extract-objectives.ts` already (re)extracts objectives per document without re-embedding/re-aligning; use it to backfill so the ~3-hour pipeline is not re-run.

---

## Implementation Units

### U1. Characterization tests for current extraction
**Goal:** Pin the current per-document extraction output so the fix cannot silently regress the 6 working guides.
**Requirements:** R3
**Dependencies:** none
**Files:**
- Create: `__tests__/lib/objective-extractor.characterization.test.ts`
- Create: `__tests__/fixtures/objectives/case3-selfstudy-topics-snippet.txt` (real Case 3 `Case Specific Objectives` → `Self-Study Topics` block)
- Create: `__tests__/fixtures/objectives/case5-selfstudy-objectives-snippet.txt` (a working EO-style block)
**Approach:** Snapshot the objective count and each objective's text+code for a representative working fixture (Case 5 EO-style) and assert the current empty result for the Case 3 fixture (documents the bug). After U2 the Case 3 assertion flips to the fixed expectation; the Case 5 assertion must remain unchanged.
**Execution note:** Characterization-first — capture real behavior before touching `SECTION_END_PATTERNS`.
**Test scenarios:**
- Covers AE2. Case 5 EO-style fixture → exact current objective list (locked).
- Case 3 topics fixture → 0 objectives *before* U2 (documents the defect), flips to the U2 expectation after.
**Verification:** Tests pass on current code (Case 3 asserts 0), then U2 flips only the Case 3 expectation.

### U2. Capture topic-objective (`TO-####`) lists inside objective sections
**Goal:** Recognize `Self-Study Topics`-style `TO-####` items as objectives instead of ending the section.
**Requirements:** R1, R2, R3
**Dependencies:** U1
**Files:**
- Modify: `lib/objective-extractor.ts` (`findObjectiveSections`, `SECTION_END_PATTERNS`, `looksLikeObjective`, `EO_CODE_PATTERN` usage)
- Modify: `__tests__/lib/objective-extractor.characterization.test.ts` (flip Case 3 expectation)
**Approach:** Introduce a topics-subsection state: when inside an objectives section and a topics sub-header (`Self-Study Topics:` and close variants) is seen, subsequent `TO-####` lines are captured as objectives (code → `eoCode`) rather than matched against the section-end pattern. Add a `TO-####` code pattern alongside `EO_CODE_PATTERN` for validation/`isCompleteObjective`. Guard the reclassification so it only applies within the topics subsection — `TO-####` lines outside an active objectives section keep their current end-marker behavior (KTD2).
**Patterns to follow:** existing `OBJECTIVE_SECTION_PATTERNS` / `SECTION_END_PATTERNS` structure; `EO_CODE_PATTERN` capture-and-store into `eoCode`.
**Test scenarios:**
- Covers AE1. Case 3 topics fixture → one objective per `TO-####` item, `eoCode` = the `TO-####`.
- Covers AE2. Case 5 EO fixture → identical to U1 snapshot (no regression).
- Edge: a `TO-####` line *outside* any objectives section still terminates as before (no over-capture).
- Edge: notes preamble lines before `Self-Study Topics:` are not captured as objectives.
**Verification:** Full characterization suite passes; Case 3 fixture now yields its topic objectives.

### U3. Objectives coverage audit
**Goal:** Report objectives-per-document and gate on self-study completeness.
**Requirements:** R4
**Dependencies:** U2
**Files:**
- Create: `scripts/audit-objectives.ts` (mirror `scripts/audit-chunks.ts` gate/report shape)
- Create: `__tests__/scripts/audit-objectives.test.ts`
**Approach:** Parse each file in `data/curriculum/`, run extraction, report count + method split per document. `--gate` fails when any self-study guide yields 0. Faculty guides are warning-only (objectives not expected).
**Patterns to follow:** `scripts/audit-chunks.ts` / `scripts/audit-figures.ts` JSON report + `--gate` exit code.
**Test scenarios:**
- Gate passes when all self-study guides > 0; fails when one is 0.
- Faculty guide with 0 objectives is a warning, not a gate failure.
**Verification:** `npx tsx scripts/audit-objectives.ts --gate` exits 0 on the corpus after U2.

### U4. Backfill the database and verify the Objectives page
**Goal:** Populate the newly-covered objectives (Case 3 at minimum) so the UI reflects them.
**Requirements:** R5
**Dependencies:** U2, U3
**Files:**
- Modify (if needed): `scripts/extract-objectives.ts` (ensure it re-extracts all 14, replacing per-document objectives idempotently)
**Approach:** Run the extraction backfill; confirm Case 3 self-study objectives appear in `course_objectives` and on `app/courses/[courseId]/objectives/page.tsx`. No re-embed/re-align.
**Test expectation: none — operational backfill.** Verified by the U3 audit + a live DB check.
**Verification:** DB `course_objectives` shows Case 3 self-study rows; Objectives page lists them; regression check confirms the other 6 docs' counts unchanged.

---

## Scope Boundaries
**In scope:** `TO-####` topic-objective capture, characterization + audit, DB backfill.

### Deferred to Follow-Up Work
- LLM-based objective extraction for guides with no recognizable objective/topics section (only pursue if the audit shows a self-study guide with genuinely unstructured objectives).
- Faculty-guide objective extraction (faculty guides carry answer keys, not student objectives — out of scope unless a stakeholder confirms they should).

---

## Verification Contract
| Gate | Command | Expect |
|------|---------|--------|
| Unit + characterization | `npm test` | All pass; Case 5 snapshot unchanged, Case 3 now populated |
| Objectives audit | `npx tsx scripts/audit-objectives.ts --gate` | Exit 0; all 7 self-study guides > 0 |
| Backfill | extraction script + DB check | Case 3 self-study rows present in `course_objectives` |
| No regression | compare per-doc counts to baseline (33/14/5/11/3/2 for Cases 1/2/4/5/6/7) | Unchanged |

## Definition of Done
- [ ] U1–U4 implemented with tests
- [ ] Case 3 self-study yields its `TO-####` topic objectives; other 6 self-study guides unchanged
- [ ] `audit-objectives.ts --gate` exits 0
- [ ] Objectives page shows Case 3 objectives on the demo course
- [ ] Lands on `fix/objectives-extraction-coverage`, PR → `feat/worldclass-chunking-goal-accuracy`

---

## Sources & Research
- Live diagnosis 2026-07-04: Case 3 self-study `Case Specific Objectives` → `Self-Study Topics` block (`TO-####` items); `SECTION_END_PATTERNS` at `lib/objective-extractor.ts:46` terminates on `TO-####`.
- `lib/objective-extractor.ts` (`findObjectiveSections`, `EO_CODE_PATTERN`), `lib/objective-cleanup.ts`, `scripts/extract-objectives.ts`, `scripts/audit-chunks.ts` (gate pattern).
- External (Tavily, 2026-07-04): med-ed learning objectives are itemized "what students will know/be able to do" statements (harvard, ucr, buffalo); topic/self-study items with codes are legitimate objective units — supports capturing the `TO-####` topics list rather than treating it as boilerplate. Not architecture-shaping (this is an internal parsing fix); recorded for reviewer context.
