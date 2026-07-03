# RushMap AI — Documentation

Central index for architecture, schema, plans, and bootstrap.

**Production branch:** `main`  
**Last updated:** 2026-07-03

---

## Start here

| Doc | Description |
|-----|-------------|
| [../README.md](../README.md) | Setup, scripts, quick start |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | How the app works — pipeline, APIs, modules, data flow |
| [SCHEMA.md](./SCHEMA.md) | Postgres tables, relationships, bootstrap order |
| [../.env.local.example](../.env.local.example) | Required environment variables |

---

## Implementation status

| Plan | Status | Notes |
|------|--------|-------|
| [001 — MVP](plans/2026-07-03-001-feat-rushmap-ai-mvp-plan.md) | Done | Core routes and pipeline |
| [002 — Framework ingestion](plans/2026-07-03-002-feat-real-document-framework-ingestion-plan.md) | Done | USMLE + AAMC parsers |
| [003 — Quality-tier models](plans/2026-07-03-003-feat-quality-tier-azure-models-plan.md) | Done | gpt-4.1 + embedding-3-large |
| [004 — Full demo seed](plans/2026-07-03-004-feat-full-demo-seed-bootstrap-plan.md) | Done | 14 documents, setup script |
| [005 — USMLE parser fix](plans/2026-07-03-005-fix-usmle-parser-rebootstrap-plan.md) | Partial | Parser merged; full process needs Azure/VPN |
| [006 — Concept Bridge map](plans/2026-07-03-006-feat-concept-bridge-curriculum-map-plan.md) | Planned | Graph + spreadsheet on `/map` |
| Objectives + upload hardening | Done | Merged via PR #2 |

---

## Bootstrap checklist

1. `cp .env.local.example .env.local`
2. `npm install`
3. Place F2F materials locally (see README)
4. `npm run copy:frameworks && npm run db:push`
5. `npm run db:seed-frameworks`
6. `npm run db:seed`
7. `PROCESS_CASE_NUMBER=1 npm run db:process` (smoke)
8. `npm run db:process` (full)
9. `npm run dev` → http://localhost:3000/courses/1

Or: `npm run setup` for the full chain.

---

## Plans & ideation

- [docs/plans/](plans/) — feature and fix plans (July 3, 2026 session)
- [docs/ideation/](ideation/) — UX ideation artifacts

---

## Repository hygiene

- **Default branch:** `main`
- **Merged feature work:** objectives explorer, upload hardening, demo metric removal — all on `main`
- Stale topic branches (`feat/course-objectives-extraction`, `cursor/harden-upload-paths-and-metrics`) should be deleted after merge
