---
title: "feat: Surface keyword tags, figure captions, and keyword definitions on the map"
date: 2026-07-04
type: feat
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
target_branch: feat/surface-keyword-figure-data (stacked on feat/worldclass-chunking-goal-accuracy)
---

# feat: Surface keyword tags, figure captions, and keyword definitions on the map

## Summary
Three pipeline-populated tables are read by **no** UI or query: `keyword_tags` (per-chunk AAMC keyword tags), `aamc_keywords` (keyword definitions), and `figure_captions` (official figure caption text). For a curriculum-audit tool, per-chunk keyword tags answer "what topics does this section actually cover" — exactly the content→topic mapping that curriculum-mapping tools surface to expose gaps and redundancies. Surface them where directors already work: keyword-tag chips (with definitions) and figure-caption text in the alignment drawer, plus an optional keyword filter on the map.

---

## Problem Frame
The pipeline writes `keyword_tags` per chunk (`lib/pipeline.ts` tagging stage), `aamc_keywords` (keyword + definition), and `figure_captions`, but `lib/queries.ts` reads none of them and no component renders them. The audit confirmed 450+ keyword tags and populated figure captions sitting unused. The alignment drawer (`components/map/AlignmentDrawer.tsx`) already renders per-chunk alignments and linked figures via `getMapData` (`lib/queries.ts:166`), so it is the natural home for keyword tags and caption text — no new data-fetch surface needed.

### Requirements
- R1. The alignment drawer shows the **AAMC keyword tags for the selected chunk** as labeled chips.
- R2. Each keyword chip exposes its **definition** (from `aamc_keywords`) on hover/expand.
- R3. Where a linked figure has an official `figure_captions` entry, its **caption text** renders with the figure preview.
- R4. Optional: the map can **filter chunks by keyword tag** so a director can see which sections touch a given topic.
- R5. No measurable regression to `getMapData` latency or the map render path.

### Acceptance Examples
- AE1. Selecting a GI chunk in the drawer shows its keyword chips (e.g. "gluconeogenesis"), each revealing its definition on hover.
- AE2. A faculty figure with an official caption shows the caption text beneath its thumbnail.
- AE3. (If R4 built) Filtering the map by a keyword highlights only chunks tagged with it.

---

## Planning Contract

### Key Technical Decisions
- **KTD1 — Extend `getMapData` + drawer payload, no new endpoints.** `getMapData` already joins `chunk_media`/`media_assets` per chunk; add `keyword_tags` (join `aamc_keywords` for definitions) and `figure_captions` the same way. Mirrors the existing media-in-map pattern rather than adding a route. (Landscape research: curriculum-mapping tools — mapedu, medhub — surface content→objective/topic mapping *inline* with the mapping view to expose gaps; keeping tags in the drawer keeps them next to the alignment they contextualize.)
- **KTD2 — Render tags with the existing shadcn/ui `Badge`.** The repo already uses `components/ui/badge` (`components/dashboard/MetricCard.tsx`); Badge's `outline`/`secondary` variants are the idiomatic tag-chip primitive (confirmed via shadcn docs). No new UI dependency.
- **KTD3 — Definitions as progressive disclosure, not a separate page.** Attach each keyword's definition to its chip (native `title`/tooltip or an expandable popover) rather than building a standalone glossary route — keeps the audit workflow in one place. A dedicated keyword glossary/search view is deferred.
- **KTD4 — Captions link by `(filename, label)`.** `figure_captions` keys on filename+label+source_index (see `scripts/import-figure-captions.ts` / the unique index); join to the drawer's already-linked `media_assets` by that key and prefer the official caption over the mined `text_for_embed` when present.

### High-Level Technical Design
```
getMapData(courseId)                      AlignmentDrawer (selected chunk)
  chunks ──┬─ alignments (existing)  ─────▶ alignment list (existing)
           ├─ chunk_media→media_assets ───▶ figure preview (existing)
           │      └─ figure_captions ──────▶ + caption text        (U1→U2, R3)
           └─ keyword_tags→aamc_keywords ──▶ + keyword chips w/ defs (U1→U2, R1/R2)
  (optional) distinct keyword_tags ────────▶ map keyword filter     (U3, R4)
```

---

## Implementation Units

### U1. Data layer — add keyword tags, definitions, and captions to the map payload
**Goal:** Return per-chunk keyword tags (+definitions) and figure captions from the map query.
**Requirements:** R1, R2, R3, R5
**Dependencies:** none
**Files:**
- Modify: `lib/queries.ts` (`getMapData`)
- Create: `__tests__/lib/queries-map-keywords.test.ts`
**Approach:** Extend `getMapData` with two aggregations keyed by chunk: `keyword_tags` joined to `aamc_keywords` (keyword + definition) → `keywordsByChunkId`; and `figure_captions` joined to the already-linked `media_assets` by `(filename, label)` → caption text on each media asset. Keep it a bounded addition to the existing query set (watch N+1 / payload size for R5).
**Patterns to follow:** the existing `mediaByChunkId` construction in `getMapData`.
**Test scenarios:**
- Happy path: a chunk with keyword tags returns `{keyword, definition}[]`; a chunk with none omits/empties the key.
- Happy path: a media asset with a `figure_captions` match carries the official caption; without a match it falls back to `text_for_embed`.
- Edge: chunk with tags but a keyword lacking a definition returns the keyword with an empty definition (no crash).
**Verification:** Unit test asserts the shape on mocked rows; live `getMapData(1)` returns keyword chips + captions for a known GI chunk.

### U2. Alignment drawer — render keyword chips (with definitions) and caption text
**Goal:** Show the new data in the drawer.
**Requirements:** R1, R2, R3
**Dependencies:** U1
**Files:**
- Modify: `components/map/AlignmentDrawer.tsx`
- Modify: `app/courses/[courseId]/map/page.tsx` (thread the new payload fields, if needed)
- Create: `__tests__/components/alignment-drawer-keywords.test.tsx` (if component tests exist; else a render-logic unit test)
**Approach:** Add a "Keyword tags" section rendering each keyword as a `Badge` (outline variant) with its definition as a tooltip/`title` (KTD3). In the existing figures section, render `figure_captions` text beneath the thumbnail when present. Hide each section when empty (mirror the existing empty-section handling).
**Patterns to follow:** the drawer's existing alignment list + linked-figures section; `Badge` usage in `components/dashboard/MetricCard.tsx`.
**Test scenarios:**
- Covers AE1. Chunk with tags renders one Badge per keyword; hovering shows the definition.
- Covers AE2. Figure with an official caption renders the caption text; figure without one renders no caption line (no empty element).
- Edge: chunk with zero tags renders no "Keyword tags" section.
**Verification:** Manual smoke on `/courses/1/map` → select a GI chunk → keyword chips with definitions and figure captions visible.

### U3. Map keyword filter (optional)
**Goal:** Let a director filter the curriculum map by keyword tag.
**Requirements:** R4
**Dependencies:** U1
**Files:**
- Modify: `app/courses/[courseId]/map/page.tsx` (add a keyword filter control alongside existing confidence/case/framework filters)
- Modify: `components/map/*` (filter state) as the existing filters are wired
**Approach:** Populate a keyword select from the distinct tags in the map payload; filtering narrows the visible chunks/tree to those carrying the tag. Follow the existing client-side filter pattern (confidence/case/framework) rather than a new server round-trip.
**Patterns to follow:** existing map filters in `app/courses/[courseId]/map/page.tsx`.
**Test scenarios:**
- Covers AE3. Selecting a keyword narrows the tree to tagged chunks; clearing restores all.
- Edge: a keyword with a single tagged chunk still filters correctly.
**Verification:** Manual smoke: filter by a keyword, confirm only tagged chunks remain.
**Execution note:** Ship U1+U2 first; U3 is additive and can land in a follow-up commit on the same branch if scope tightens.

---

## Scope Boundaries
**In scope:** keyword tags + definitions + figure captions in the drawer (U1–U2); optional keyword filter (U3).

### Deferred to Follow-Up Work
- A standalone AAMC keyword glossary/search page (KTD3 keeps definitions inline for now).
- Keyword-coverage analytics (e.g., a "most/least tagged topics" view) — surface only if directors ask after the inline tags ship.
- Surfacing keyword tags in the natural-language search results (separate surface from the map drawer).

---

## Verification Contract
| Gate | Command | Expect |
|------|---------|--------|
| Unit tests | `npm test` | Pass, incl. new map-keyword query tests |
| Map query smoke | live `getMapData(1)` | Known GI chunk returns keyword chips (+definitions) and figure captions |
| Drawer smoke | `/courses/1/map` → GI chunk | Keyword chips with definitions + caption text render; empty sections hidden |
| Regression | map render + existing map tests | Unchanged; no latency regression (R5) |

## Definition of Done
- [ ] U1–U2 implemented with tests (U3 optional, same branch)
- [ ] Drawer shows per-chunk keyword tags with definitions and official figure captions
- [ ] `keyword_tags` / `aamc_keywords` / `figure_captions` are now read by the UI
- [ ] Lands on `feat/surface-keyword-figure-data`, PR → `feat/worldclass-chunking-goal-accuracy`

---

## Sources & Research
- External (Tavily, 2026-07-04): curriculum-mapping tools (mapedu.com, medhub.com) map content to objectives/topics *inline* to surface gaps and redundancies — validates surfacing per-chunk keyword tags next to alignments (shaped KTD1). Competency-objective mapping in med-ed mirrors our AAMC/USMLE frameworks (buffalo.edu).
- External (Ref, 2026-07-04): shadcn/ui `Badge` component supports `outline`/`secondary` variants for tag chips (`ui.shadcn.com/docs/components/base/badge`) — chosen primitive for keyword chips (KTD2).
- Internal: `lib/queries.ts` `getMapData` (existing `mediaByChunkId` pattern), `components/map/AlignmentDrawer.tsx`, `components/ui/badge`, `scripts/import-figure-captions.ts` (figure_captions key), `lib/pipeline.ts` tagging stage.
