---
title: "fix: USMLE parser and full rebootstrap"
date: 2026-07-03
type: fix
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
origin: docs/plans/2026-07-03-004-feat-full-demo-seed-bootstrap-plan.md
---

# fix: USMLE parser and full rebootstrap

## Goal Capsule

**Objective:** Correct USMLE Content Outline parsing so organ-system subdomains attach to the right parent `stable_id`, then re-seed frameworks and re-run the full seven-guide bootstrap from plan 004.

**Authority:** Case 1 smoke audit found valid alignments but misleading map labels (`usmle:social-sciences:*` for GI content). Root cause: `indexOf`-based section slicing treated PDF table-of-contents headers as body sections.

**Stop when:** Parsed JSON has no `usmle:social-sciences:gastrointestinal-system` rows; framework catalog re-embedded; all seven faculty guides processed; Case 1 GI alignments reference `usmle:gastrointestinal-system:*`.

---

## Summary

Replace `parseUsmleOutlineText` with a line-based state machine that skips TOC runs (consecutive system headers without substantive follow-up lines) before parsing systems and subsections. Re-run plan 004 bootstrap chain after the fix. `clearDocumentArtifacts` in `lib/pipeline.ts` already makes re-processing idempotent.

---

## Problem Frame

The USMLE PDF linearizes with a multi-page TOC listing all organ systems before the real outline body. The old parser used first `indexOf` hits, producing empty top-level system rows and dumping all substantive content under the last header ("Social Sciences") as bogus subdomains.

---

## Requirements

- R1. Line-based USMLE parser with TOC skip heuristic
- R2. Unit tests proving GI subdomains are not children of `usmle:social-sciences`
- R3. Clean framework re-seed (delete-then-insert already in `scripts/seed-frameworks.ts`)
- R4. Full rebootstrap: `db:push` → `db:seed-frameworks` → `db:seed` → `db:process` (all 7)
- R5. Verification gates from plan 004: tests pass; no invalid framework IDs; map/gaps populated

---

## Key Technical Decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| KTD-1 | **Line-based parser, not `indexOf` slices** | TOC and body share identical header strings; only line order + substantive follow distinguishes them |
| KTD-2 | **TOC skip: header without bullets/subsection within 12 lines → skip** | Matches fixture and full PDF structure |
| KTD-3 | **No pipeline change** | `clearDocumentArtifacts` already runs at start of `runFullPipeline` |
| KTD-4 | **Full re-seed required** | `stable_id` values change; existing alignments reference stale IDs |
| KTD-5 | **`buildUsmleChildStableId` caps at 120 chars** | Corrected parser produces longer subdomain slugs; `usmle_domains.stable_id` is `varchar(120)` |

---

## Implementation Units

### U1. Fix USMLE parser

**Goal:** Parse organ systems and subsections with correct `parentStableId`.

**Requirements:** R1

**Dependencies:** none

**Files:** `lib/framework-parsers.ts`

**Approach:** `findUsmleContentStart` scans for first system header with substantive follow. State machine walks lines: system header → top-level row; subsection header → child row; bullets accumulate into subdomain `fullText`.

**Execution note:** Implement with failing TOC fixture test first.

**Test scenarios:**
- Happy path: `usmle-snippet.txt` yields `usmle:gastrointestinal-system` with child subdomains
- TOC skip: `usmle-toc-snippet.txt` has no `usmle:social-sciences` child named "Gastrointestinal System"
- Edge: empty input yields empty array (deferred if not exercised)

**Verification:** `npm test` passes; full PDF parse has `giSubs > 0` and `giMisplaced === 0`.

---

### U2. Extend parser tests

**Goal:** Lock regression for TOC mis-parse.

**Requirements:** R2

**Dependencies:** U1

**Files:** `__tests__/lib/framework-parsers.test.ts`, `__tests__/fixtures/frameworks/usmle-toc-snippet.txt`

**Test scenarios:**
- GI subs have `parentStableId === usmle:gastrointestinal-system`
- Social Sciences subs contain ethics content, not organ-system names

**Verification:** 17+ tests pass.

---

### U3. Framework re-seed

**Goal:** Replace catalog rows and embeddings with corrected `stable_id` set.

**Requirements:** R3

**Dependencies:** U1, U2

**Files:** `scripts/seed-frameworks.ts`, `data/frameworks/parsed/usmle-2025.json`

**Approach:** `npm run db:seed-frameworks`. Confirm parsed JSON has no `social-sciences:gastrointestinal-system`.

**Test expectation:** none — runtime seed with Azure embeddings.

**Verification:** ~632 USMLE rows embedded; unique top-level systems ≈ 18.

---

### U4. Course re-seed and full process

**Goal:** Re-bootstrap course metadata and process all seven faculty guides.

**Requirements:** R4

**Dependencies:** U3

**Files:** `scripts/seed.ts`, `scripts/process-documents.ts`, `lib/pipeline.ts`

**Approach:** `npm run db:push` (idempotent) → `db:seed` → `db:process`. Pipeline clears per-document artifacts before each run.

**Verification:** All seven docs `status=complete`; course has chunks and alignments across all cases.

---

### U5. Post-rebootstrap verification

**Goal:** Confirm map labels and API responses use corrected USMLE IDs.

**Requirements:** R5

**Dependencies:** U4

**Files:** `app/api/courses/[id]/map/route.ts`, `app/api/courses/[id]/gaps/route.ts`

**Approach:** Query Case 1 alignments for GI-related chunks; expect `usmle:gastrointestinal-system:*` not `usmle:social-sciences:*`.

**Test expectation:** none — smoke query.

**Verification:** Map API returns alignments; zero invalid framework IDs.

---

## Verification Contract

1. `npm test` — all pass
2. `data/frameworks/parsed/usmle-2025.json` — no `social-sciences:gastrointestinal`
3. Framework seed completes without embedding errors
4. All seven guides processed (exit 0)
5. Case 1 alignments use correct GI `stable_id` prefix

---

## Definition of Done

- Parser fix merged in `lib/framework-parsers.ts` with regression tests
- Neon database re-seeded with corrected framework catalog and full course processing
- Demo APIs return alignments with valid, correctly labeled USMLE domains

---

## Scope Boundaries

### In scope

Parser fix, tests, full rebootstrap chain, smoke verification

### Out of scope

- AAMC guidebook full EPA text ingestion
- Azure Agent Framework migration
- Production deployment

### Deferred to Follow-Up Work

- Characterization test against full PDF golden file (large fixture)
- Automated post-process alignment audit script

---

## Risks & Dependencies

- **Azure/Neon network** — seed and process require live credentials
- **Long runtime** — full seven-guide process ~2–4 hours
- **Stable ID churn** — any cached alignment data outside Neon is stale after re-seed
