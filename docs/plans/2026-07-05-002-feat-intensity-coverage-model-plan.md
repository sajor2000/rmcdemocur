---
title: "feat: Intensity-based curriculum coverage model (Introduced -> Reinforced -> Mastered)"
date: 2026-07-05
type: feat
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
product_contract_source: ce-plan-bootstrap
target_branch: feat/intensity-coverage-model (off main)
---

# feat: Intensity-based curriculum coverage model

## Summary
Replace the misleading binary "% covered" with an **intensity** coverage model grounded in curriculum-mapping practice (Introduced -> Reinforced -> Mastered). A framework topic's coverage is the number of distinct **documents (sessions)** that address it: **Gap (0), Introduced (1), Reinforced (2-3), Strong (4-7), Heavily covered (8+)**. Present **both** the broad "addressed" count and the intensity spectrum. Apply the one model consistently across the **program** view (full framework), the **course** dashboard (organ-scoped), and **gap analysis** — for **both AAMC and USMLE**, at **entire-curriculum and per-module (M1/M2)** levels — with **educator-legible tooltips + a method explainer** so a curriculum committee trusts it. Surface each document's **extracted learning objectives** in the interactive curriculum map (regex-first extraction, LLM only as a secondary fallback — the shipped extractor), for every course and rolled up for the full curriculum. Everything is **downloadable as CSV/JSON datasets** (per-course and full-curriculum) for the education team, and the **interactive map works for every course** (and links from the program view). Capture the model as permanent doctrine in AGENTS.md.

**Why:** A single GI course was reading as "covering 245/597 USMLE domains" (incl. schizophrenia off one chunk). Binary coverage conflates "touched once" with "taught." The intensity model surfaces the real signals a committee needs: **gaps** (0 places), **redundancy** (many places / across courses = spiral reinforcement or waste), and everything between.

---

## Problem Frame
- **Binary coverage over-counts.** `covered = >=1 alignment` counts a lone tangential (if confident) alignment as full coverage. 75 of 245 "covered" USMLE domains came from a single chunk.
- **Wrong grain.** The AI alignment engine is deep-root permissive; measuring at the metric level (documents that address a topic) mitigates it honestly without re-running alignment.
- **Two altitudes, one model.** Course pages must stay organ-scoped (a GI course isn't graded on cardiology); the program view is full-framework. Both need the same intensity vocabulary.
- **Trust.** The audience is medical educators, not AI engineers. Every number needs a plain-language explanation of method + an AI-assisted-needs-review disclaimer.

---

## Guiding Principle: Auditable, deterministic-first knowledge (north star)
The value to the Rush Medical College curriculum team is **trustworthy, verifiable knowledge about their own curriculum** — not AI opinions they cannot check. Three rules, in priority order, govern every feature:
1. **Deterministic where possible.** Counts, structural extraction (regex objective codes EO-####/TO-####, framework IDs, document/course joins), and set operations are reproducible and need no faith. Use them for every metric and every rollup.
2. **LLM only as a flagged backup.** The one inherently-fuzzy step is semantic alignment (curriculum passage -> framework topic). Confine LLM/embeddings to that step; label every LLM-derived claim as AI-generated, carry its confidence + rationale + source excerpt, and gate it behind faculty review. Never add LLM to metadata, counts, extraction, or exports.
3. **Everything traces to source.** Every number a committee sees drills down to the exact document, page, and excerpt that produced it, and shows whether it is **AI-only** or **faculty-validated**. Auditability is the product, not a nicety.

These rules make the tool's output defensible in front of an accreditation body — the ultimate audience.

---

## Product Contract

### Requirements
- **R1** Coverage is intensity, not binary: level = # distinct documents addressing a topic — Gap 0 / Introduced 1 / Reinforced 2-3 / Strong 4-7 / Heavy 8+.
- **R2** Present **both** metrics everywhere coverage appears: broad "addressed" (>=1 place) AND the intensity spectrum.
- **R3** Works for **both** AAMC and USMLE frameworks.
- **R4** Reported at **entire-curriculum** and **per-module** (M1, M2) scope. Hierarchy: chunk -> document -> course -> module -> program.
- **R5** Surface, for gap analysis: **gaps** (0 places), and **redundancy** (topics addressed in the most documents / across the most courses).
- **R6** **Full method transparency (first-class, pervasive).** EVERY metric and count shown to a user carries a plain-language explanation of *how it was computed and why* — a curriculum-committee member with no AI expertise can understand the logic behind every number. This is not just level tooltips: each number (addressed, gaps, each spectrum level, per-system counts, redundancy) is explainable in-place (tooltip/popover) plus a persistent "How coverage is measured" method box on every coverage surface (program, course, gaps) stating: the AI aligns curriculum passages to framework topics; a topic's level = the number of distinct documents that address it; the level thresholds; and that alignments are AI-generated and require faculty review.
- **R7** One model applied consistently across the **program** view (full framework), **course** dashboard (organ-scoped), and **gap-analysis** page.
- **R8** The coverage-model doctrine is captured in `AGENTS.md` so every future change honors it.
- **R9** Two-level IA preserved: course = organ-scoped (`lib/course-scope.ts`); program = full framework.
- **R10** **Document learning objectives in the map.** The extracted per-document learning objectives (`course_objectives`; EO-####/TO-#### codes) are surfaced in the interactive curriculum map and drawer — a curriculum item's objectives shown alongside its framework alignments — for **every** course and rolled up for the **full curriculum**. Extraction stays regex-first with LLM only as a secondary fallback (the shipped `extractObjectivesFromText` + cleanup path); no new LLM dependence.
- **R11** **Exportable datasets & files for the education team.** Every coverage view is downloadable as data — CSV (spreadsheet) and JSON — for both **per-course** and **full-curriculum** scope: the intensity spectrum per topic, the gap list, the redundancy list, and the topic->document/course provenance. Files are self-describing (headers + a method note) so a committee can use them outside the app.
- **R12** **Deterministic-first, LLM-secondary doctrine.** Extraction and matching prefer deterministic/structural (regex, keys, framework IDs) signals; the LLM/embedding path is a secondary fallback only, mirroring the shipped objectives extractor (regex-first, LLM cleanup only on miss). New logic (objectives surfacing/join, export generation) follows this; it is also the direction for reducing alignment over-matching.
- **R13** **Interactive curriculum map works for every course and for the full curriculum.** The selection-linked map is per-course today (`/courses/[courseId]/map`); it must work for all courses (not just course 1), and a full-curriculum map view spans courses/modules.
- **R14** **Auditability (first-class).** Every surfaced figure (coverage level, gap, redundancy, objective mapping) traces to its source — document, page/section, excerpt — in at most one interaction; and every alignment shows whether it is **AI-only** or **faculty-validated**. Metrics are computed deterministically (reproducible); the only LLM-derived input (alignment) is labeled and confidence-carried. A committee can defend any number to an accreditor.

### Acceptance Examples
- **AE1** For RMD 563 (one GI/M1 course), the program view shows USMLE **245 addressed of 597**, spectrum **105 introduced / 80 reinforced / 42 strong / 18 heavy**, **352 gaps**; AAMC **55/71 addressed**. Not a single "% covered".
- **AE2** Behavioral Health reads honestly: "eating disorders" and "substance use" as Strong/Heavy; schizophrenia/conduct-disorder as **Introduced (1 doc)**, not covered.
- **AE3** The redundancy panel lists "Nutrition" (12 documents) as the most-addressed topic.
- **AE4** Hovering "Reinforced" shows: "Addressed across 2-3 course documents." A method box states the alignments are AI-generated and need faculty review.
- **AE5** Switching scope from "Entire curriculum" to "M1" recomputes the same spectrum for M1's courses only (today identical; must differ once M2 exists).

---

## Key Technical Decisions
- **KTD1 — A "place" is a distinct DOCUMENT (session), not a chunk.** Documents are the reinforcement unit in the spiral model; chunk depth within a doc is one treatment. (Grounded: Tulane/SCU I-R-M; Texas A&M gaps/redundancy; spiral-across-modules literature.)
- **KTD2 — Level thresholds are named, tunable constants** (`1 / 2-3 / 4-7 / 8+`), co-located with the coverage engine, not scattered magic numbers.
- **KTD3 — One shared coverage engine.** A pure module `lib/coverage.ts` computes a `CoverageDist` for (framework, set-of-topics-with-doc-counts) and owns `levelOf` + level metadata (label + tooltip). `getProgramSummary`, `getCourseSummary`, and the gaps query all consume it — no duplicated definitions.
- **KTD4 — Module = curated `course -> module` map** in `lib/course-scope.ts` now (RMD 563 -> M1); a real `courses.module` DB column is deferred (Scope Boundaries).
- **KTD5 — Never render a single "% covered."** Always "X addressed of Y" + spectrum. AAMC may show an addressed % as a secondary figure but always beside the spectrum.
- **KTD6 — Framework scoping asymmetry:** USMLE is organ-scoped at the course level (course-scope) and full-framework at program level; AAMC is cross-cutting (never organ-scoped) at both.
- **KTD7 — Deterministic-first, LLM-secondary (R12).** Course metadata (module), objectives surfacing (join the already-extracted `course_objectives`; extraction itself is regex-first with LLM only on miss), and export serialization are deterministic — no new LLM in the loop. The LLM/embedding path stays confined to the existing alignment + objectives-cleanup engines; new logic must not add LLM dependence.
- **KTD8 — Exports are a pure serializer over the same engine data** (`lib/coverage-export.ts`), not a second query path — the CSV/JSON and the on-screen numbers come from one source so they never diverge. Files self-describe (method note in-file) to satisfy R6 outside the app.

---

## High-Level Technical Design

Coverage hierarchy and where each surface measures it:

```
chunk -> document(session) -> course -> module(M1/M2) -> program
                 ^                                 ^          ^
        level = # distinct docs         per-module scope   full framework
        that address a topic            (course dashboard   (program view)
                                         = organ-scoped)
```

Shared engine shape (directional, not final signatures):

```
// lib/coverage.ts
LEVELS = [gap, introduced(1), reinforced(2-3), strong(4-7), heavy(8+)]  // each: key,label,docRange,tooltip,colorClass
levelOf(docCount) -> Level
distribution(topicDocCounts: number[], total) -> CoverageDist
  { total, addressed, substantive(>=2), gaps, introduced, reinforced, strong, heavy }
```

Data flow: one SQL pass returns per-(framework, topic, course) distinct-document counts; JS rolls it up per scope (all courses, or a module's courses) and per framework, then `distribution()` buckets it. Same rows drive per-system breakdown and the redundancy list.

---

## Current State (updated 2026-07-05 — merged to `main`)
Ten of fourteen units are **shipped and merged to `main`** (PRs #20 + #21); `main` is green (`tsc` clean, 220 tests). AE1 verified live (USMLE 245/597, 352 gaps, 105/80/42/18; AAMC 55/71). **Pick up the remaining four from a fresh branch off `main`.**

- **DONE (merged):**
  - **U1** `lib/coverage.ts` — canonical engine (levels, thresholds, `distribution()`, `levelLabel()`, tooltips, `METHOD_NOTE`); single source, 6 unit tests. No inline level redefinitions anywhere (R7 holds).
  - **U2** `getProgramSummary` routed through the engine. **U3** M1/M2 module map (`lib/course-scope.ts`).
  - **U4** shared `components/coverage/{CoverageSpectrum,MethodExplainer}.tsx`. **U5** full `/program` view (scope selector, per-system table, redundancy).
  - **U6** course-dashboard intensity spectrum (organ-scoped, `getCourseSummary.usmleSpectrum/aamcSpectrum`).
  - **U8** AGENTS.md coverage doctrine. **U10** document objectives in the map drawer (`getMapData.objectivesByDocument`). **U11** CSV/JSON exports (`lib/coverage-export.ts`, `/api/program/export`).
  - **U12** verified: the map is fully `courseId`-parameterized (no code change needed; cross-course single canvas stays deferred).

- **REMAINING (build next, off `main`):**
  - **U7** — gap-analysis page adopts the level vocabulary (Gap/Introduced/Reinforced/…); it already has amber/red severity from an earlier PR.
  - **U13** — provenance drill-down + trust signals (a figure -> its documents/excerpts; AI-only vs faculty-validated). The per-topic doc rollup already exists in `getProgramSummary`/`getCoverageExportRows`.
  - **U14** — learning-spiral view (a topic's Introduced->Reinforced sequence across documents/modules).
  - **U9** — e2e coverage of the program journey (extend `e2e/journeys.spec.ts`).

- **Reuse, do not reinvent:** all four import levels/labels/`distribution` from `lib/coverage.ts` and render via the shared coverage components; keep everything deterministic (no new LLM) per the north star.

---

## Implementation Units

### U1. Shared coverage engine (`lib/coverage.ts`)
**Goal:** One canonical definition of levels, thresholds, `CoverageDist`, and level metadata (label + educator tooltip + color).
**Requirements:** R1, R2, KTD1-3.
**Files:** `lib/coverage.ts` (new), `__tests__/lib/coverage.test.ts` (new).
**Approach:** Pure functions, no DB. Export `LEVELS` (ordered, with `key`,`label`,`docRange`,`tooltip`,`colorClass`), `levelOf(docs)`, `distribution(docCounts, total)`. Thresholds as named consts.
**Test scenarios:** `levelOf` at boundaries (0->gap, 1->introduced, 2/3->reinforced, 4/7->strong, 8->heavy); `distribution` on `[]` (all gaps), mixed counts, `addressed`+`gaps`===`total`, `substantive` = reinforced+strong+heavy. `Covers AE2`.
**Verification:** engine has zero DB imports; every consumer imports levels/labels from here.

### U2. Generalize `getProgramSummary` onto the engine
**Goal:** Both frameworks x {entire, per-module} `CoverageDist` + USMLE per-system breakdown + redundancy list. (Prototype exists; harden + test on U1.)
**Requirements:** R1-R5, R9.
**Dependencies:** U1, U3.
**Files:** `lib/queries.ts` (getProgramSummary), `__tests__/lib/program-summary.test.ts` (new).
**Approach:** Single per-(fw, topic, course) distinct-document query; roll up per scope via `courseModule`; call `distribution()`. Keep per-system (USMLE) + `mostCovered`.
**Test scenarios:** entire == union of modules; AAMC and USMLE both returned; per-system gaps = leaf_total - addressed; mostCovered sorted by docs. `Covers AE1, AE3, AE5`.
**Verification:** returns the AE1 numbers against the live DB.

### U3. Module mapping (`lib/course-scope.ts`)
**Goal:** `courseModule(code)` + module list; RMD 563 -> M1.
**Requirements:** R4, KTD4.
**Files:** `lib/course-scope.ts`, `__tests__/lib/course-scope.test.ts`.
**Approach:** Curated `COURSE_MODULE` map; unmapped -> "Unassigned". Note the deferred DB-column path.
**Test scenarios:** known code -> module; unknown -> "Unassigned".
**Verification:** program scopes list = ["Entire curriculum", ...distinct modules].

### U4. Shared coverage UI (`components/coverage/*`)
**Goal:** Reusable `CoverageSpectrum` (stacked bar with the 5 levels), `LevelLegend`, and a `MethodExplainer` box — all sourcing labels/tooltips from `lib/coverage.ts`.
**Requirements:** R2, R6.
**Dependencies:** U1.
**Files:** `components/coverage/CoverageSpectrum.tsx`, `components/coverage/MethodExplainer.tsx` (new).
**Approach:** Presentational; each segment carries the level tooltip; MethodExplainer states the AI-alignment method + level definitions + faculty-review disclaimer in plain language.
**Test scenarios:** spectrum renders proportional segments summing to total incl. gaps; each segment/legend carries its tooltip text. `Covers AE4`.
**Verification:** a non-technical reader can decode every color from the on-screen legend + method box.

### U5. Program view on the shared components (`app/program/page.tsx`)
**Goal:** Scope selector (Entire / M1 / ...), both-framework spectrum panels, USMLE per-system table (with per-system spectrum), redundancy panel, MethodExplainer. Nav entry.
**Requirements:** R2-R6.
**Dependencies:** U2, U4.
**Files:** `app/program/page.tsx`, `components/program/ProgramView.tsx` (new client), `components/layout/Header.tsx`.
**Approach:** Server page fetches `getProgramSummary`; client `ProgramView` owns the scope tabs; render USMLE + AAMC spectrums for the selected scope; systems table; redundancy list; method box.
**Test scenarios:** default "Entire curriculum" shows AE1 numbers; scope tab switch recomputes; gaps/redundancy visible; no "% covered" as a lone figure. `Covers AE1, AE3, AE5`.
**Verification:** e2e drives /program and asserts the spectrum + method box + scope switch.

### U6. Course dashboard retrofit (organ-scoped intensity)
**Goal:** Replace the binary "In-Scope USMLE Gaps / X of Y" with the intensity spectrum (organ-scoped) + both metrics; add tooltips. AAMC shown with the spectrum too.
**Requirements:** R2, R6, R7, R9.
**Dependencies:** U1, U4.
**Files:** `lib/queries.ts` (getCourseSummary), `app/courses/[courseId]/page.tsx`, `components/dashboard/MetricCard.tsx`.
**Approach:** Compute the same doc-based distribution scoped to the course's target systems; render `CoverageSpectrum`. Keep organ-scope note.
**Test scenarios:** RMD 563 in-scope spectrum sums to the in-scope domain total; out-of-scope systems still excluded; both metrics present.
**Verification:** dashboard shows the spectrum, no lone "% covered"; organ scope preserved.

### U7. Gap-analysis page retrofit
**Goal:** Gap cards / table use the level vocabulary (Gap / Introduced / Reinforced / ...) instead of covered/partial; tooltips; keep the CSV export.
**Requirements:** R5, R6, R7.
**Dependencies:** U1.
**Files:** `app/courses/[courseId]/gaps/page.tsx`, `lib/gap-analyzer.ts`, `lib/queries.ts` (getGapExportRows if needed).
**Approach:** Map coverage to levels; "Gap" and "Introduced" are the actionable buckets; label severity by level.
**Test scenarios:** gap list = level `gap`; introduced surfaced as thin coverage; CSV rows carry the level.
**Verification:** gaps page severity reflects levels; export includes level.

### U8. AGENTS.md coverage doctrine
**Goal:** Permanent doctrine capturing the **north star** (auditable, deterministic-first knowledge — the three rules), the intensity model, KTD1 (document = place), level thresholds, both-metrics rule, two-level IA, pervasive method transparency (R6), and the export/deterministic rules.
**Requirements:** R8, R12, R14.
**Files:** `AGENTS.md`.
**Approach:** A "Curriculum coverage & knowledge model (canonical)" section; concise; points to `lib/coverage.ts`, `lib/course-scope.ts`. State plainly: deterministic where possible, LLM only as flagged backup confined to alignment, everything traces to source, never reintroduce binary "% covered". `Test expectation: none -- docs.`
**Verification:** section present; a future contributor cannot add binary coverage, un-audited numbers, or new LLM dependence without contradicting it.

### U9. Verification pass
**Goal:** Unit (engine, queries), integration (live numbers = AE1), e2e (program journey + tooltips).
**Requirements:** all.
**Dependencies:** U1-U7.
**Files:** `e2e/journeys.spec.ts` (extend), the per-unit test files above.
**Test scenarios:** engine boundaries; program/course numbers; e2e asserts spectrum + method box + scope switch + no lone "% covered".
**Verification:** `npm test` + `npm run test:e2e` green; `tsc` clean.

### U10. Surface document learning objectives in the map
**Goal:** Show each document's extracted objectives (EO-####/TO-#### + text) in the curriculum map / drawer, for every course, and expose them per-course + full-curriculum. Reuse the shipped regex-first extractor; no new LLM.
**Requirements:** R10, R12.
**Dependencies:** none (builds on shipped objectives + map).
**Files:** `lib/queries.ts` (`getMapData` — add objectives per document/chunk; a program/full-curriculum objectives rollup), `components/map/AlignmentDrawer.tsx` + `components/map/CurriculumTree.tsx` (show objectives for the selected item), `app/courses/[courseId]/objectives/page.tsx` (link into the map), `__tests__/lib/queries-map-objectives.test.ts`.
**Approach:** Join `course_objectives` by document; attach the document's objectives to its chunks/sections in the map payload; render them in the drawer next to alignments/keywords. Full-curriculum rollup lists objectives across courses. Deterministic join — no LLM.
**Test scenarios:** a selected curriculum item shows its document's objectives (EO/TO codes); a document with objectives exposes them; a full-curriculum objectives list spans courses; works for a non-course-1 course. `Covers R10`.
**Verification:** the map drawer shows the item's learning objectives; objectives visible per course and program-wide.

### U11. Exportable datasets & files (`app/api/program/export`, extend course export)
**Goal:** Downloadable CSV + JSON of the coverage data for per-course and full-curriculum scope: per-topic level + document/course provenance, gaps, redundancy. Self-describing (headers + method note).
**Requirements:** R11, R2, R6 (exports also carry the method note).
**Dependencies:** U1, U2, U6.
**Files:** `app/api/program/export/route.ts` (new; `?format=csv|json&scope=...`), `app/api/courses/[courseId]/export/route.ts` (extend to the intensity model), `lib/coverage-export.ts` (new, pure serializer), `__tests__/lib/coverage-export.test.ts`, download buttons on the program + course pages.
**Approach:** Pure serializer builds rows (topic, framework, system, level, docs, courses, provenance) from the same engine data; CSV first row(s) carry a `# method:` comment/header; JSON includes a `method` block. Deterministic (no LLM).
**Test scenarios:** CSV parses with expected columns + method header; JSON shape stable; per-course vs full-curriculum scope differ; gaps and redundancy exportable; `Covers R11`.
**Verification:** downloaded CSV opens in a spreadsheet with legible columns + method note; JSON is valid and complete.

### U12. Interactive map for every course + full-curriculum map
**Goal:** Ensure the selection-linked map works for all courses (not just course 1); add a full-curriculum map entry.
**Requirements:** R13.
**Dependencies:** none (builds on shipped map).
**Files:** `app/courses/[courseId]/map/page.tsx` (verify course-agnostic), `components/layout/Sidebar.tsx` / course list, `app/program/page.tsx` (link to a cross-course map or reuse per-course with a course switcher).
**Approach:** Confirm the map is fully parameterized by courseId (no course-1 assumptions); add navigation to each course's map; provide a program-level path into the map. A true cross-course single map canvas is optional (note if deferred).
**Test scenarios:** map loads for a second course id; selection-linking works per course; program view links into the map.
**Verification:** every course's map is reachable and functional; no course-1 hardcoding.

### U13. Provenance drill-down + trust signals (auditability)
**Goal:** Every coverage figure links to its source; every alignment shows AI-only vs faculty-validated. Deterministic.
**Requirements:** R14, R6.
**Dependencies:** U1, U2, U6.
**Files:** `lib/queries.ts` (attach per-topic provenance: documents + excerpts + page/section; review-status counts), the coverage components (`components/coverage/*`) + drawer, program + course pages.
**Approach:** For any level/gap/redundancy figure, expose the contributing documents (already in the engine's per-topic rollup) and let a click reveal document + section + excerpt + confidence + rationale (drawer pattern exists). Add a trust badge/summary: N alignments, X% faculty-validated (approved/rejected) vs AI-only. All from deterministic joins over `alignments`/`chunks`/`documents`.
**Test scenarios:** clicking a system's covered count lists its documents; an alignment renders AI-only vs faculty-validated; the trust summary matches the review counts. `Covers R14`.
**Verification:** every headline number reaches its source in one interaction; AI vs faculty is visible everywhere coverage appears.

### U14. Learning-spiral / sequencing view
**Goal:** For a framework topic, show where it is Introduced -> Reinforced across the curriculum (which documents/modules, in order) — make the spiral legible. Deterministic.
**Requirements:** R1, R4, R14.
**Dependencies:** U1, U2.
**Files:** `lib/queries.ts` (per-topic document sequence), a `components/coverage/SpiralView.tsx`, surfaced from the program/topic view.
**Approach:** For a selected topic, list the addressing documents ordered by course/module and case number; annotate each as a "place" so the committee sees the introduce->reinforce arc and spots topics introduced but never reinforced (thin) or over-repeated (redundant). Pure counts/order — no LLM.
**Test scenarios:** a topic with docs across 2 modules shows the ordered sequence; a 1-doc topic reads "introduced, not reinforced". `Covers R14`.
**Verification:** selecting a topic shows its coverage sequence across the curriculum.

---

## Scope Boundaries
**In scope:** the intensity model + shared engine + program view + course dashboard retrofit + gap-analysis retrofit + tooltips/method box + AGENTS.md, both frameworks, entire + per-module.
### Deferred to Follow-Up Work
- A real `courses.module` / `courses.type` DB column + CRUD (curated maps suffice for now).
- Fixing the deeper alignment over-matching in the AI engine (the intensity model mitigates at the metric level; re-running alignment is a separate effort). This is the biggest lever on the "deterministic-first" north star — a future pass could add deterministic pre-filters (keyword/framework-ID structural matches) so LLM alignment is truly a backup.
- **Knowledge-surfacing roadmap (all deterministic, auditable):** objective->framework crosswalk report; duplicate/near-duplicate content detection across documents (text similarity, for consolidation); coverage change-over-time diff between reprocesses; framework-version tracking (which USMLE/AAMC edition a mapping is against); a cross-course single-canvas map.
- "Introduced/Reinforced/Mastered" tied to *assessment* data (we infer from teaching documents only; no assessment signal yet).
- Landing-page coverage stats adopting the spectrum.

---

## Verification Contract
| Gate | Expect |
|------|--------|
| Engine | `levelOf`/`distribution` correct at all boundaries; no DB imports |
| Program numbers | AE1 exactly (245/597, 105/80/42/18, 352 gaps; AAMC 55/71) |
| Both frameworks x scope | USMLE + AAMC returned for Entire + each module |
| Consistency | program, course, gaps all import levels from `lib/coverage.ts` |
| Method transparency (R6) | EVERY number on every coverage surface (program, course, gaps) is explainable in-place (tooltip/popover) + a persistent method box; a non-AI educator can state how each count was computed |
| No binary | no surface renders a lone "% covered" |
| Organ scope | course dashboard stays organ-scoped; program is full-framework |
| Tests | `npm test` + `npm run test:e2e` green; `tsc` clean |

## Definition of Done
- [ ] Shared engine is the single source of level definitions; all three surfaces consume it
- [ ] Program view: both frameworks, scope selector, gaps + redundancy, tooltips + method box
- [ ] Course dashboard + gap-analysis retrofit to the spectrum (organ-scoped where applicable)
- [ ] AGENTS.md coverage doctrine committed (incl. the deterministic-first, R6-transparency, and export rules)
- [ ] Document learning objectives surfaced in the map (per course + full curriculum), regex-first extraction reused
- [ ] Exportable CSV + JSON for per-course AND full-curriculum (spectrum, gaps, redundancy, provenance), self-describing with the method note
- [ ] Interactive map works for every course (no course-1 hardcoding); reachable from the program view
- [ ] Auditability: every headline figure drills to source (document/section/excerpt) in one interaction; AI-only vs faculty-validated visible everywhere coverage appears
- [ ] Learning-spiral view: a topic's Introduced->Reinforced sequence across the curriculum is visible; all metrics computed deterministically (LLM confined to alignment, flagged)
- [ ] AE1-AE5 verified; `npm test` + `npm run test:e2e` + `tsc` green

---

## Sources & Research
- Curriculum-mapping I-R-M model: Tulane (introduced/reinforced/mastered), SCU curriculum matrix.
- Purpose = gaps, redundancies, misalignments: Texas A&M; emedley "identifying gaps and redundancies".
- Spiral across modules: PMC "coherent and coordinated learning spiral across two medical schools".
- Mapping curriculum DB to the USMLE content outline (completeness has no universal bar) — ResearchGate/PMC.
- Prototype: `lib/queries.ts getProgramSummary`, `lib/course-scope.ts`, `app/program/page.tsx` (this session).
