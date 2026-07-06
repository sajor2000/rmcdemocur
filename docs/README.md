# RushMap AI — Documentation

Central index for architecture, schema, plans, and bootstrap.

**Production branch:** `main`  
**Last updated:** 2026-07-06

---

## Start here

| Doc | Description |
|-----|-------------|
| [../AGENTS.md](../AGENTS.md) | **Agents (canonical):** read order, git/CE policy, commands |
| [../CONCEPTS.md](../CONCEPTS.md) | Domain vocabulary |
| [../README.md](../README.md) | Setup, scripts, quick start |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | How the app works — pipeline, APIs, modules, data flow |
| [SCHEMA.md](./SCHEMA.md) | Postgres tables, relationships, bootstrap order |
| [solutions/README.md](./solutions/README.md) | Index of documented fixes and conventions |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | Git workflow, quality gates, branch hygiene |
| [DEMO_REVIEW.md](./DEMO_REVIEW.md) | Faculty stakeholder demo sanity-check list |
| [../.env.local.example](../.env.local.example) | Required environment variables |

---

## Implementation status

| Plan | Status | Notes |
|------|--------|-------|
| [001 — MVP](plans/2026-07-03-001-feat-rushmap-ai-mvp-plan.md) | Done | Core routes and pipeline |
| [002 — Framework ingestion](plans/2026-07-03-002-feat-real-document-framework-ingestion-plan.md) | Done | USMLE + AAMC parsers |
| [003 — Quality-tier models](plans/2026-07-03-003-feat-quality-tier-azure-models-plan.md) | Done | gpt-4.1 + embedding-3-large |
| [004 — Full demo seed](plans/2026-07-03-004-feat-full-demo-seed-bootstrap-plan.md) | Done | 14 documents, setup script |
| [005 — USMLE parser fix](plans/2026-07-03-005-fix-usmle-parser-rebootstrap-plan.md) | Done | Full 14-doc corpus processed (2,906 chunks, ~8,900 alignments) — PR #7 |
| [006 — Concept Bridge map](plans/2026-07-03-006-feat-concept-bridge-curriculum-map-plan.md) | Superseded | Original graph+spreadsheet+CSV scope not built; replaced by lighter selection-linked map highlighting — PR #19, scoped by plan 2026-07-05-001 U2 |
| [007 — Chunking + goal accuracy](plans/2026-07-03-007-feat-worldclass-chunking-and-goal-accuracy-plan.md) | Done | Semantic chunking, embed breadcrumbs — PR #4 (with #5–#7 merged in first) |
| [008 — Bootstrap review fixes](plans/2026-07-03-008-fix-bootstrap-review-findings-plan.md) | Done | P1–P3 from ce-code-review; commits `a2970a5`, `959e861` |
| [009 — Curriculum image ingestion](plans/2026-07-03-009-feat-curriculum-image-ingestion-plan.md) | Done | Faculty DOCX extract + map previews (MVP), then self-study extraction, PDF answer-images, and vision-OCR fallback (Full phase U8–U10) — PR #32, #33, #34 |
| [010 — Deployment-readiness hardening](plans/2026-07-03-010-feat-deployment-readiness-hardening-plan.md) | Done | Media locator keys, caption durability, Vercel Blob driver — commits `8338baf`..`a7f23d3` |
| [2026-07-04-001 — Objectives extraction coverage](plans/2026-07-04-001-fix-objectives-extraction-coverage-plan.md) | Done | Fixed TO-#### topic-objective parsing (Case 3 was 0) — PR #9 |
| [2026-07-04-002 — Surface keyword/figure data](plans/2026-07-04-002-feat-surface-keyword-figure-data-plan.md) | Done | Keyword chips + definitions (PR #10), then figure_captions merge + map keyword filter — PR #31 |
| [2026-07-04-003 — Page-journey audit](plans/2026-07-04-003-feat-page-journey-audit-plan.md) | Done | Manual QA pass (PR #13) → fixes landed in #14, #15, #16 |
| [2026-07-05-001 — Program view + map UX](plans/2026-07-05-001-feat-program-view-and-map-ux-plan.md) | Done | Program view, selection-linked map, P3 polish — PR #17, #19–#21 |
| [2026-07-05-002 — Intensity coverage model](plans/2026-07-05-002-feat-intensity-coverage-model-plan.md) | Done | Introduced→Reinforced→Mastered model, program+course+gaps — PR #20, #21, #23–#26 |
| [2026-07-05-003 — Demo-readiness coverage/visual audit](plans/2026-07-05-003-fix-demo-readiness-coverage-visual-audit-plan.md) | Done | Unified coverage engine, editorial visual redesign, Playwright baselines — PR #35, #39 |
| [2026-07-05-004 — Source page numbers](plans/2026-07-05-004-feat-source-page-numbers-plan.md) | Done | PDF/PPTX page threading to chunks and objectives — PR #40 |
| [2026-07-05-005 — Objectives CSV export](plans/2026-07-05-005-feat-objectives-csv-export-plan.md) | Done | Course + program objectives export — PR #40 |
| [2026-07-05-006 — Case analytics drill-down](plans/2026-07-05-006-feat-case-analytics-drilldown-plan.md) | Done | Per-case analytics, faculty/self-study lens — PR #40 |
| [2026-07-06-001 — Case analytics completion](plans/2026-07-06-001-feat-case-analytics-completion-plan.md) | Done | Merged into case analytics drill-down work — PR #40 |
| Brand refresh | Done | Official Rush logo + black chrome — PR #41 |
| Objectives + upload hardening | Done | Merged via PR #2 |

---

## Bootstrap checklist

**Recommended (resumable, with smoke gate):**

1. `cp .env.local.example .env.local` — Neon + Azure credentials
2. `npm install` + place F2F materials locally
3. **Existing database only** (skip on a fresh DB — `db:push` below creates everything cleanly): run these one-time media-portability scripts, in order, before `db:push` —
   `npm run db:collapse-duplicate-media` (must run first; `db:push` throws if duplicate `media_assets` rows remain), then `npm run db:backfill-media-paths`, then `npm run db:migrate-captions`. See `docs/plans/2026-07-03-010-feat-deployment-readiness-hardening-plan.md` for what each one does.
4. `npm run copy:frameworks && npm run db:push`
5. `npm run db:bootstrap:smoke` — schema, incremental framework embed, seed, Case 1 process, verify
6. `npm run db:audit-bootstrap` — read-only reconcile manifest / DB / cache
7. `npm run db:bootstrap:full` — remaining 13 documents (skip-complete)
8. `npm run dev` → http://localhost:3000/courses/1

**Media storage (Vercel deploys):** Vercel's runtime filesystem is read-only, so figures must be served from Vercel Blob in production. Set `BLOB_READ_WRITE_TOKEN` (or `BLOB_STORE_ID` if using a dashboard-connected store) before running `npm run db:extract-media`, which uploads extracted figures to Blob alongside the local write. Without either var, media serving falls back to the local filesystem (dev-only).

**Manual chain (legacy):**

1. `npm run db:seed-frameworks` — supports `--force`, `--track-bootstrap`; resumes per `stable_id`
2. `npm run db:seed`
3. `npm run db:extract-media` — extract faculty DOCX figures (see docs/SCHEMA.md bootstrap order)
4. `PROCESS_CASE_NUMBER=1 npm run db:process -- --skip-complete`
5. `npm run db:process -- --skip-complete`

Or: `npm run setup` for the non-resumable full chain.

**Ideation:** [checkpointed-bootstrap](ideation/2026-07-03-checkpointed-bootstrap-ideation.html) · [hardening](ideation/2026-07-03-checkpointed-bootstrap-hardening-ideation.html)

---

## Plans & ideation

- [docs/plans/](plans/) — feature and fix plans (July 3, 2026 session)
- [docs/solutions/](solutions/) — searchable learnings (`/ce-compound`)
- [docs/ideation/](ideation/) — UX ideation artifacts

---

## Agent policy & git hygiene

CE commit/ignore rules and git workflow: **[AGENTS.md](../AGENTS.md)** (canonical — do not duplicate tables here).

Post-session CE checklist (searchable): [solutions/conventions/ce-artifacts-git-vs-local.md](solutions/conventions/ce-artifacts-git-vs-local.md)
