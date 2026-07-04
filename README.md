# RushMap AI

AI-powered curriculum mapping demo for Rush Medical College — **RMD 563: Food to Fuel**.

Maps faculty guides and self-study materials to the official **AAMC PCRS (2013 — 8 domains, 58 competencies)** and **13 Core EPAs**, plus the **USMLE 2025 Content Outline**, surfaces alignment gaps, natural-language search, and a regex-first **Learning Objectives** explorer with optional LLM cleanup.

> Framework provenance: PCRS is the 2013 AAMC Physician Competency Reference Set (the AAMC Curriculum Inventory mapping standard); its successor "Foundational Competencies for UME" was released Dec 2024. Competency/EPA text is committed as attributed authority JSON under `data/frameworks/` (see `aamc-pcrs-2013.json`, `aamc-core-epas.json`).

**Repository:** [github.com/sajor2000/rmcdemocur](https://github.com/sajor2000/rmcdemocur)  
**Default branch:** `main`

---

## Features

| Area | Route | Description |
|------|-------|-------------|
| Landing | `/` | Hero, stats, Rush branding |
| Upload | `/upload` | Drag-drop upload with SSE processing status |
| Dashboard | `/courses/1` | Metrics, AAMC bar chart, USMLE heatmap, recent alignments |
| Curriculum map | `/courses/1/map` | Tri-directional trees, case filters (1–7), alignment drawer |
| Learning objectives | `/courses/1/objectives` | Regex extraction + optional LLM cleanup; filter by case, confidence, section |
| Gap analysis | `/courses/1/gaps` | Gap cards, coverage table, CSV export |
| Search | `/courses/1/search` | Natural-language Q&A with cited chunks |
| About | `/about` | Product explainer |

Human-in-the-loop: alignments can be **approved** or **rejected** from the map drawer.

---

## Stack

- **Frontend:** Next.js 14 (App Router), Tailwind, shadcn-style UI
- **Database:** Neon Postgres + pgvector + Drizzle ORM
- **AI:** Azure AI Foundry — `gpt-4.1` (align + search + objective cleanup) + `text-embedding-3-large` @ 1536 dims

---

## Prerequisites

- Node.js 20+
- Neon Postgres database (`DATABASE_URL`)
- Azure OpenAI deployments (for embedding, alignment, search, and optional objective cleanup)
- Local curriculum source files (not committed — see [Curriculum sources](#curriculum-sources))

---

## Setup

### 1. Environment

```bash
cp .env.local.example .env.local
# Fill in DATABASE_URL and Azure credentials
npm install
```

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Neon Postgres connection string |
| `AZURE_OPENAI_ENDPOINT` | Azure AI Foundry endpoint |
| `AZURE_OPENAI_API_KEY` | API key |
| `AZURE_OPENAI_DEPLOYMENT_CHAT` | Chat model (default `gpt-4.1`) |
| `AZURE_OPENAI_DEPLOYMENT_EMBED` | Embedding model (default `text-embedding-3-large`) |
| `AZURE_OPENAI_EMBEDDING_DIMENSIONS` | Must be `1536` (matches `vector(1536)` schema) |
| `API_SECRET` | Optional — when set, **all** `/api/*` routes (reads and writes) require a credential: a `Authorization: Bearer <API_SECRET>` header for server-to-server calls, or the short-lived HMAC session cookie the app issues to the browser on page load (so `fetch` and EventSource authenticate automatically same-origin). **Important:** any visitor who can load a page receives a session cookie, so `API_SECRET` alone blocks direct API scraping, not page-mediated access — put the deployment behind a page-level gate (e.g. Vercel Deployment Protection) when the content must be private. Unset = fully open (dev default). |
| `RETRIEVAL_MAX_DISTANCE` | Optional — max cosine distance for framework/keyword candidate retrieval. Unset = no filtering. Calibrate after any re-embed with `npx tsx scripts/calibrate-thresholds.ts`. |
| `SEARCH_MIN_SIMILARITY` | Optional — min cosine similarity for search results. Unset = no filtering. Calibrated by the same script. |

### 2. Framework authority files

```bash
npm run copy:frameworks   # copies from Curriculum Map - AI project/ → data/frameworks/
npm run db:push
npm run db:seed-frameworks   # USMLE 2025 PDF + AAMC keywords xlsx → Postgres
```

Add `--skip-embeddings` to `db:seed-frameworks` when Azure is unavailable (framework text only).

### 3. Course seed

```bash
npm run db:seed
```

Seeds **RMD 563** as course id **1** with **14 documents** (7 faculty guides + 7 self-study guides). Re-seed resets Postgres serials so `/courses/1` URLs stay stable.

### 4. Document processing (requires Azure + VPN if applicable)

```bash
# Smoke test one case first:
PROCESS_CASE_NUMBER=1 npm run db:process

# Full pipeline (all 14 documents):
npm run db:process
```

Or run the full local bootstrap:

```bash
npm run setup
```

### 5. Learning objectives (optional batch report)

```bash
npm run db:extract-objectives
```

Writes `data/objectives-extraction-report.json`. The `/objectives` UI reads objectives extracted during `db:process`.

### 6. Dev server

```bash
npm run dev
```

Open [http://localhost:3000/courses/1](http://localhost:3000/courses/1).

---

## Curriculum sources

Place Rush F2F materials locally (gitignored):

```
2026 Curriculum Inventory Project F2F materials/
```

`npm run db:process` copies files into `data/curriculum/`:

| Source (F2F folder) | Destination |
|---------------------|-------------|
| Faculty Guide 01–07 | `RMD563_FacultyGuide_Case{N}_*.pdf/docx` |
| Self Study Guide 01–07 | `RMD563_SelfStudyGuide_Case{N}_*.docx` |

Framework binaries live under `data/frameworks/` (see `npm run copy:frameworks`). Parsed JSON is written to `data/frameworks/parsed/` on seed.

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm test` | Vitest unit tests |
| `npm run setup` | Full local bootstrap (files → seed → process) |
| `npm run setup:files` | Copy curriculum + framework files only |
| `npm run copy:frameworks` | Copy USMLE/AAMC authority files |
| `npm run configure:azure` | Helper for Foundry env configuration |
| `npm run db:push` | Push Drizzle schema to Neon |
| `npm run db:seed-frameworks` | Parse and seed framework tables |
| `npm run db:seed` | Seed course + 14 document rows |
| `npm run db:process` | Copy, parse, embed, align all guides |
| `npm run db:extract-media` | Extract faculty DOCX embedded images to `data/curriculum/media/` (MVP scope) |
| `npx tsx scripts/audit-figures.ts --gate` | Figure registry audit before process |
| `npm run db:realign` | Re-run alignment + gap recompute (no re-embed) |
| `npm run db:extract-objectives` | Batch objective extraction report |

**After changing chat or embedding deployments:** re-run `db:seed-frameworks` → `db:seed` → `db:process` (or `npm run setup`). Use `db:realign` only when chunk embeddings are unchanged.

---

## Project structure

```
app/                  Next.js routes and API handlers
components/           UI (map, gaps, objectives, layout)
drizzle/              Schema and migrations
lib/                  Pipeline, parsers, Azure AI, objective extraction
scripts/              Seed, process, and setup CLIs
data/                 Local curriculum + frameworks (gitignored binaries)
AGENTS.md             Canonical agent entry — read order, git/CE policy ([CLAUDE.md](CLAUDE.md) points here)
CONCEPTS.md           Domain vocabulary
docs/                 Architecture, schema, plans, solutions, ideation
```

---

## Deploy (Vercel)

1. Push `main` to GitHub
2. Connect Vercel project; add env vars from `.env.local.example`
3. Run seed + process **locally** before stakeholder demo (recommended — pipeline is long-running)

---

## Documentation

| Doc | Description |
|-----|-------------|
| [AGENTS.md](AGENTS.md) | **Canonical agent guide** — read order, git/CE policy, commands |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Pipeline stages, API routes, module map, data flow |
| [docs/SCHEMA.md](docs/SCHEMA.md) | Postgres tables, ER diagram, framework ID conventions |
| [docs/README.md](docs/README.md) | Doc index, bootstrap checklist, plan status |
| [docs/solutions/](docs/solutions/) | Searchable learnings from past fixes (bugs, conventions, workflow) |
| [CONCEPTS.md](CONCEPTS.md) | Shared domain vocabulary for bootstrap, pipeline, and curriculum terms |
| [docs/plans/](docs/plans/) | Implementation plans |
| [docs/ideation/](docs/ideation/) | Curriculum map UX ideation |

---

## Branches

**`main`** is the only active branch. Feature work is merged via pull request.
