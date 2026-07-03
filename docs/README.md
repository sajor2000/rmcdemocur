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
| [007 — Chunking + goal accuracy](plans/2026-07-03-007-feat-worldclass-chunking-and-goal-accuracy-plan.md) | Planned | Semantic chunking, auth/docs hardening |
| [008 — Bootstrap review fixes](plans/2026-07-03-008-fix-bootstrap-review-findings-plan.md) | Done | P1–P3 from ce-code-review; commits `a2970a5`, `959e861` |
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
- [docs/ideation/](ideation/) — UX ideation artifacts

---

## Compound Engineering — what lives in git vs local

CE skills produce two kinds of output: **decision artifacts** (worth sharing in git) and **machine/runtime output** (keep local).

### Commit to git (team + future agents)

| Path | Purpose |
|------|---------|
| `docs/plans/*.md` | Implementation plans (`ce-plan`, enriched brainstorms). Progress comes from git, not checkboxes in the file. |
| `docs/ideation/*.html` | Early UX/product exploration (`ce-ideate`). |
| `docs/brainstorms/*` | Legacy requirements-only docs, if you use them. |
| `docs/solutions/*.md` | Durable learnings after fixing something (`ce-compound`). Create when a fix is non-obvious. |
| `docs/ARCHITECTURE.md`, `docs/SCHEMA.md`, `docs/README.md` | Product/engineering truth the app and agents should read. |
| `.compound-engineering/config.example.yaml` | Optional shared defaults (no secrets). |

### Keep local (never commit)

| Path | Purpose |
|------|---------|
| `.compound-engineering/config.local.yaml` | Personal CE prefs (`plan_output`, `confirm:auto`, delegate settings). **Already gitignored.** |
| `/tmp/compound-engineering/` | Code-review run artifacts, reviewer JSON, `report.md`. Ephemeral. |
| `data/bootstrap-state.json` | Resumable bootstrap checkpoint. **Already gitignored.** |
| `data/frameworks/.embedding-cache.jsonl` | Embedding cache during seed. **Already gitignored.** |
| `data/curriculum/`, `data/uploads/` | Copied/processed content. **Already gitignored.** |
| `.env.local` | Secrets. **Already gitignored.** |

### Rule of thumb

- If it answers **why we built it this way** or **what to do next** → git under `docs/`.
- If it is **resume state, cache, secrets, or /tmp review output** → local only.

After a `ce-code-review` or `ce-work` session: commit any new/updated plans and optional `docs/solutions/` entry; leave `/tmp/.../ce-code-review/` on disk until you are done reading the report, then delete.

---

## Repository hygiene

- **Default branch:** `main`
- **Merged feature work:** objectives explorer, upload hardening, demo metric removal — all on `main`
- Stale topic branches (`feat/course-objectives-extraction`, `cursor/harden-upload-paths-and-metrics`) should be deleted after merge
