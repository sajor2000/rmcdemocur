# RushMap AI — Documentation

Central index for plans, ideation artifacts, and implementation status.

**Last updated:** 2026-07-03  
**Production branch:** `main` (includes all work from `feat/course-objectives-extraction`)

---

## Quick links

| Resource | Path |
|----------|------|
| Project README | [../README.md](../README.md) |
| Environment template | [../.env.local.example](../.env.local.example) |
| Drizzle schema | [../drizzle/schema.ts](../drizzle/schema.ts) |
| Processing pipeline | [../lib/pipeline.ts](../lib/pipeline.ts) |
| Objective extraction | [../lib/objective-extractor.ts](../lib/objective-extractor.ts) |

---

## Implementation status

| Plan | Type | Status | Notes |
|------|------|--------|-------|
| [001 — RushMap AI MVP](plans/2026-07-03-001-feat-rushmap-ai-mvp-plan.md) | feat | **Done** | Landing, upload, dashboard, map, gaps, search, about |
| [002 — Real document & framework ingestion](plans/2026-07-03-002-feat-real-document-framework-ingestion-plan.md) | feat | **Done** | USMLE PDF + AAMC xlsx parsers, `copy:frameworks`, `db:seed-frameworks` |
| [003 — Quality-tier Azure models](plans/2026-07-03-003-feat-quality-tier-azure-models-plan.md) | feat | **Done** | `gpt-4.1` + `text-embedding-3-large` @ 1536 dims |
| [004 — Full demo seed bootstrap](plans/2026-07-03-004-feat-full-demo-seed-bootstrap-plan.md) | feat | **Done** | 7 faculty + 7 self-study guides, F2F copy mapping, `npm run setup` |
| [005 — USMLE parser rebootstrap](plans/2026-07-03-005-fix-usmle-parser-rebootstrap-plan.md) | fix | **Partial** | Line-based USMLE parser merged; full `db:process` pending Azure/VPN |
| [006 — Concept Bridge curriculum map](plans/2026-07-03-006-feat-concept-bridge-curriculum-map-plan.md) | feat | **Planned** | Force-directed graph + spreadsheet on `/map`; blocked on clean demo data |
| Objectives extraction (branch work) | feat | **Done** | `/objectives` UI, regex-first extractor, LLM cleanup merge, API hardening |

---

## Bootstrap checklist

Use this order for a fresh local demo database:

1. `cp .env.local.example .env.local` — fill Neon + Azure credentials
2. `npm install`
3. Place F2F materials in `2026 Curriculum Inventory Project F2F materials/`
4. `npm run copy:frameworks` (or place files manually in `data/frameworks/`)
5. `npm run db:push`
6. `npm run db:seed-frameworks`
7. `npm run db:seed` — course id **1**, 14 document rows
8. `PROCESS_CASE_NUMBER=1 npm run db:process` — smoke test
9. `npm run db:process` — full pipeline
10. `npm run dev` → [http://localhost:3000/courses/1](http://localhost:3000/courses/1)

**Known blocker:** Azure endpoint `rua-nonprod-ai-innovation.cognitiveservices.azure.com` requires network/VPN access. Without it, embeddings and alignments will not populate.

---

## Plans (`docs/plans/`)

Sequential implementation plans from the July 3, 2026 build session:

1. **001** — MVP scope: routes, schema, seed, process CLI, Rush branding
2. **002** — Wire real USMLE/AAMC authority files into Postgres
3. **003** — Upgrade to quality-tier chat and embedding models
4. **004** — Expand seed to all seven cases + self-study guides; bootstrap script
5. **005** — Fix USMLE TOC parser bug; rebootstrap frameworks and alignments
6. **006** — Add Concept Bridge graph + spreadsheet views (not started)

Each plan follows the `ce-unified-plan/v1` contract with Goal Capsule, Product Contract, and Definition of Done.

---

## Ideation (`docs/ideation/`)

- [2026-07-03 — Interactive curriculum map ideation](ideation/2026-07-03-interactive-curriculum-map-ideation.html) — ranked UX concepts; **Concept Bridge Graph** selected for plan 006

---

## Git workflow

```
main                              ← production (all merged features)
feat/course-objectives-extraction ← merged into main
```

To set GitHub default branch to `main` after push:

```bash
gh auth login
gh repo edit sajors2000/rmcdemocur --default-branch main
```

---

## Local folders (gitignored)

These are expected on disk but not committed:

| Folder | Purpose |
|--------|---------|
| `2026 Curriculum Inventory Project F2F materials/` | Source PDFs/DOCX for faculty + self-study guides |
| `Curriculum Map - AI project/` | USMLE PDF, AAMC xlsx, guidebook |
| `data/curriculum/` | Copied curriculum binaries |
| `data/frameworks/*.pdf` / `*.xlsx` | Framework authority binaries |
| `data/objectives-extraction-report.json` | Output of `db:extract-objectives` |
