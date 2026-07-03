# RushMap AI — Documentation

Central index for architecture, schema, plans, and bootstrap.

**Production branch:** `main`  
**Last updated:** 2026-07-03

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
| [007 — Chunking + goal accuracy](plans/2026-07-03-007-feat-worldclass-chunking-and-goal-accuracy-plan.md) | Planned | Semantic chunking, auth/docs hardening |
| [008 — Bootstrap review fixes](plans/2026-07-03-008-fix-bootstrap-review-findings-plan.md) | Done | P1–P3 from ce-code-review; commits `a2970a5`, `959e861` |
| [009 — Curriculum image ingestion](plans/2026-07-03-009-feat-curriculum-image-ingestion-plan.md) | Done (MVP) | Faculty DOCX extract, map previews; Full phase (U8–U10) deferred |
| Objectives + upload hardening | Done | Merged via PR #2 |

---

## Bootstrap checklist

**Recommended (resumable, with smoke gate):**

1. `cp .env.local.example .env.local` — Neon + Azure credentials
2. `npm install` + place F2F materials locally
3. `npm run copy:frameworks && npm run db:push`
4. `npm run db:bootstrap:smoke` — schema, incremental framework embed, seed, Case 1 process, verify
5. `npm run db:audit-bootstrap` — read-only reconcile manifest / DB / cache
6. `npm run db:bootstrap:full` — remaining 13 documents (skip-complete)
7. `npm run dev` → http://localhost:3000/courses/1

**Manual chain (legacy):**

1. `npm run db:seed-frameworks` — supports `--force`, `--track-bootstrap`; resumes per `stable_id`
2. `npm run db:seed`
3. `PROCESS_CASE_NUMBER=1 npm run db:process -- --skip-complete`
4. `npm run db:process -- --skip-complete`

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
