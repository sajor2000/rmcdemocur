# Agent guide — RushMap AI

Entry point for AI agents and new contributors. **Canonical** for project goal, read order, repo layout, commands, git workflow, and CE artifact policy. [CLAUDE.md](CLAUDE.md) points here for Claude-specific tooling.

---

## Project goal

**RushMap AI** is a curriculum-mapping demo for Rush Medical College — course **RMD 563: Food to Fuel**.

**Problem:** Faculty guides and self-study materials must align to national competency frameworks (AAMC PCRS 2013, 13 Core EPAs, USMLE 2025 Content Outline). Manual mapping is slow, inconsistent, and hard to audit across seven cases and fourteen documents.

**What we build:** Ingest real curriculum PDFs/DOCX locally → parse, chunk, embed, and align each segment to framework nodes → surface results in a stakeholder-ready UI: dashboard metrics, tri-directional **curriculum map**, **gap analysis**, **natural-language search**, and a **Learning Objectives** explorer. Human reviewers approve or reject alignments in the map drawer.

**Success looks like:** A demo on `/courses/1` where search and map views cite real curriculum text (and key figures where extracted), gaps reflect honest coverage against committed framework authority JSON, and bootstrap can resume after interruption without re-processing completed documents.

**Out of scope for this repo:** Licensing redistribution of AAMC/USMLE PDFs (binaries stay local/gitignored); production multi-tenant SaaS; multimodal embeddings or OCR in the current MVP.

---

## Curriculum coverage & knowledge model (CANONICAL — do not violate)

The product's value to the Rush curriculum committee is **auditable, verifiable knowledge they can defend to an accreditor** — not AI opinions. Three rules govern every feature, in priority order:

1. **Deterministic where possible.** Counts, structural extraction (regex objective codes EO-####/TO-####, framework IDs, document/course joins), and set operations are reproducible — use them for every metric and rollup. **Never add LLM/embedding dependence to metadata, counts, extraction, or exports.** The LLM path is confined to the existing semantic *alignment* (passage → framework topic) and objectives *cleanup* (regex-first, LLM only on miss) engines.
2. **LLM only as a flagged backup.** Every LLM-derived claim (alignment) is labeled AI-generated and carries confidence + rationale + source excerpt, gated behind faculty review. Surface **AI-only vs faculty-validated** wherever coverage appears.
3. **Everything traces to source.** Every figure a user sees drills down (in ≤1 interaction) to the exact document/section/excerpt that produced it.

**Coverage is INTENSITY, not binary.** A framework topic's level = the number of **distinct documents (sessions)** that address it: **Gap (0) · Introduced (1) · Reinforced (2–3) · Strong (4–7) · Heavily covered (8+)** — the Introduced→Reinforced→Mastered model. Always present **both** the broad "addressed" count and the spectrum; **never render a lone "% covered."**

- **Single source:** `lib/coverage.ts` owns level definitions, thresholds, labels, tooltips, `distribution()`, and the method note. Program, course, gaps, and exports all import from it — no inline redefinitions.
- **Two-level IA:** course pages are organ-scoped (`lib/course-scope.ts` target systems); the program view (`/program`) is full-framework. AAMC is cross-cutting (never organ-scoped).
- **Method transparency (R6):** every number is explained in-place (tooltip) plus a persistent `MethodExplainer` box, in plain language for non-AI educators.

Full spec: `docs/plans/2026-07-05-002-feat-intensity-coverage-model-plan.md`.

---

## Current state (`main`)

Production demo on **`main`** (course id **1**, 14 documents, 7 cases). Shipped capabilities:

| Area | Status | Notes |
|------|--------|-------|
| Semantic chunking | Shipped | Section-aware splitter, ToC/junk filter, heading breadcrumbs in `embedText` |
| Framework authority | Shipped | AAMC PCRS 2013 + Core EPAs JSON; USMLE 2025 parser |
| Intensity coverage | Shipped | Document-count spectrum — `lib/coverage.ts` is canonical everywhere |
| Program view | Shipped | `/program` — M1 rollup, coverage + objectives CSV exports |
| Case analytics | Shipped | `/courses/1/cases/{n}` — faculty/self-study lens, drill-down |
| Objectives export | Shipped | Course + program CSV via `/objectives` and `/program` |
| Source pages | Shipped | PDF/PPTX page numbers on chunks and objectives where available |
| Image ingestion | Shipped | Faculty DOCX + self-study + PDF figures; map drawer previews; Vercel Blob in prod |
| Auth | Shipped | Optional `API_SECRET` — all `/api/*` require Bearer or HMAC session cookie |
| Retrieval floors | Shipped | `RETRIEVAL_MAX_DISTANCE` / `SEARCH_MIN_SIMILARITY` — calibrate via `scripts/calibrate-thresholds.ts` |
| Brand | Shipped | Official Rush logo (`public/rush-logo.png`), black chrome, `#006837` green |
| Concept Bridge graph | Deferred | Original spreadsheet/graph UX on `/map` not built — selection-linked highlighting instead |
| Visual regression | Partial | Playwright baselines exist; refresh after UI changes (`e2e/visual.spec.ts`) |

Curriculum files live under `data/curriculum/` (gitignored). Full plan status: [docs/README.md](docs/README.md). Faculty review checklist: [docs/DEMO_REVIEW.md](docs/DEMO_REVIEW.md).

---

## Read first

| Order | File | Why |
|-------|------|-----|
| 1 | [CONCEPTS.md](CONCEPTS.md) | Domain vocabulary (bootstrap, pipeline, document status, media assets) |
| 2 | [docs/README.md](docs/README.md) | Doc index, plan status, bootstrap checklist |
| 3 | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Pipeline stages, API routes, module map |
| 4 | [docs/SCHEMA.md](docs/SCHEMA.md) | Postgres tables and framework ID conventions |
| 5 | [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) | Git workflow, branch hygiene, quality gates |

Before debugging bootstrap, pipeline, chunking, or media: search [docs/solutions/](docs/solutions/) by `module`, `tags`, or `problem_type` in YAML frontmatter.

Default branch for merge target: **`main`**.

---

## Repository layout

```
app/              Next.js App Router — pages (/courses/1/map, objectives, gaps, search) + API routes
components/       React UI (map drawer, gaps, objectives, layout)
lib/              Pipeline, parsers, chunker, Azure AI, bootstrap state, media linker/storage
  chunker.ts      Semantic section splitting + embedText breadcrumbs
  media-*.ts      Figure registry, DOCX extract linking, map previews
  pipeline.ts     Parse → chunk → embed → align (+ media upsert/link)
scripts/          CLIs — bootstrap, seed, process, audit, extract-media, calibrate-thresholds
drizzle/          Schema (documents, chunks, alignments, media_assets, chunk_media, frameworks)
__tests__/        Vitest — mirror lib/ and scripts/ coverage (315+ tests)
docs/
  ARCHITECTURE.md SCHEMA.md   Engineering truth
  CONTRIBUTING.md DEMO_REVIEW.md  Workflow + faculty checklist
  plans/                      Implementation plans (ce-plan / ce-work)
  solutions/                  Past fixes and conventions (ce-compound)
  ideation/                   UX exploration HTML (historical)
public/           Static assets (rush-logo.png)
data/             Local only (gitignored) — curriculum copies, frameworks, media binaries, bootstrap state
.compound-engineering/
  config.example.yaml         Committed template
  config.local.yaml           Personal CE settings (gitignored)
```

---

## Commands (common)

```bash
npm test                          # Vitest (315+ tests) — run after lib/ or scripts/ changes
npm run lint
npm run db:push                   # Push Drizzle schema to Neon
npm run db:bootstrap:smoke        # Case 1 gate (schema + Azure + verify)
npm run db:bootstrap:full         # All documents (after smoke passes)
npm run db:audit-bootstrap        # Read-only manifest / DB reconcile
npm run db:extract-media          # Faculty DOCX image extract → data/curriculum/media/
npx tsx scripts/audit-figures.ts --gate   # Figure registry audit before process
npx tsx scripts/calibrate-thresholds.ts   # Tune retrieval env floors from live embeddings
npm run dev                       # http://localhost:3000/courses/1
```

Do **not** run long bootstrap, full `db:process`, or Azure-heavy scripts unless the user explicitly asks — cost and runtime.

---

## Conventions

- **Bootstrap resume:** Document `complete` means all chunks embedded and all chunks aligned. See `docs/solutions/logic-errors/bootstrap-resume-false-complete-and-destructive-rerun.md`.
- **Pipeline isolation:** One bad document must not abort the rest — `process-documents.ts` catches per-file errors.
- **Chunking:** Chunks carry heading context in `embedText`; junk/ToC fragments are filtered before embed.
- **Media (MVP):** Registry all 14 docs; extract binaries for faculty DOCX only; link `answer_image` / `provided_image` to chunks; serve via `/api/media/[assetId]` under `data/curriculum/media/`.
- **Auth:** When `API_SECRET` is set, every `/api/*` route requires credentials — see README env table before changing middleware.
- **Retrieval:** Relevance floors default off when env vars unset; recalibrate after re-embed with `calibrate-thresholds.ts`.
- **Secrets:** `.env.local` only — never commit. See `.env.local.example`.
- **Plans vs progress:** Plans do not store checkboxes; derive progress from git and `docs/README.md` status table.
- **CE session checklist:** After `ce-code-review` or `ce-work`, see [docs/solutions/conventions/ce-artifacts-git-vs-local.md](docs/solutions/conventions/ce-artifacts-git-vs-local.md).

---

## CE artifacts — commit vs local

CE skills produce **decision artifacts** (share in git) and **runtime artifacts** (keep local). When adding paths, update this section and `.gitignore` — do not duplicate tables elsewhere.

### Commit to git

| Path | Purpose |
|------|---------|
| `AGENTS.md`, `CONCEPTS.md` | Agent entry point and domain vocabulary |
| `docs/plans/*.md` | Implementation plans. Progress comes from git, not checkboxes in the file. |
| `docs/solutions/**/*.md` | Durable learnings after fixing something (`ce-compound`) |
| `docs/ideation/*.html` | Early UX/product exploration (`ce-ideate`) |
| `docs/ARCHITECTURE.md`, `docs/SCHEMA.md`, `docs/README.md` | Engineering truth the app and agents should read |
| `.compound-engineering/config.example.yaml` | Shared defaults without secrets |

### Keep local (never commit)

| Path | Purpose |
|------|---------|
| `.compound-engineering/config.local.yaml` | Personal CE prefs. **Gitignored.** |
| `/tmp/compound-engineering/` | Code-review run artifacts, reviewer JSON. Ephemeral. |
| `data/bootstrap-state.json` | Resumable bootstrap checkpoint. **Gitignored.** |
| `data/bootstrap-state.json.tmp` | Atomic-write temp for bootstrap state. **Gitignored.** |
| `data/frameworks/.embedding-cache.jsonl` | Embedding cache during seed. **Gitignored.** |
| `data/curriculum/`, `data/curriculum/media/`, `data/uploads/` | Copied/processed content and figure binaries. **Gitignored.** |
| `.env.local` | Secrets. **Gitignored.** |

### Rule of thumb

- If it answers **why we built it this way** or **what to do next** → git under `docs/` (or root agent docs above).
- If it is **resume state, cache, secrets, or /tmp review output** → local only.

After a `ce-code-review` or `ce-work` session: commit new/updated plans and optional `docs/solutions/` entries; leave `/tmp/.../ce-code-review/` until you finish reading the report, then delete.

---

## Scope boundaries

- Curriculum PDFs/DOCX, framework PDFs, and extracted media live under `data/` locally — not in git.
- Framework **authority text** is committed as attributed JSON under `data/frameworks/` (`aamc-pcrs-2013.json`, `aamc-core-epas.json`) — the source `loadAamcPcrsCatalog` reads. `data/frameworks/parsed/` is a regenerated debug dump, not the authority.
- Upload SSE and API auth have special cases — read `docs/ARCHITECTURE.md` before changing middleware or upload routes.
- Rush logo: `public/rush-logo.png` (official wordmark; do not commit regenerated framework PDFs or ideation HTML unless asked)

---

## Git workflow

- **Default branch:** `main` only. Branch from `main`, merge via PR.
- **Feature branches:** delete merged branches after push (`git branch -d cursor/<name>` or your branch name).
- **Stashes:** drop obsolete WIP after verifying changes are on `main`.
- **Commit messages:** `feat:`, `fix:`, `docs:`, `refactor:` (see recent history).
