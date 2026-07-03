# RushMap AI

AI-powered curriculum mapping demo for Rush Medical College — **RMD 563: Food to Fuel**.

Maps faculty guides and self-study materials to **AAMC PCRS/Core EPAs** and the **USMLE 2025 Content Outline**, surfaces alignment gaps, natural-language search, and a regex-first **Learning Objectives** explorer with optional LLM cleanup.

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
docs/plans/           Implementation plans (see docs/README.md)
```

---

## Deploy (Vercel)

1. Push `main` to GitHub
2. Connect Vercel project; add env vars from `.env.local.example`
3. Run seed + process **locally** before stakeholder demo (recommended — pipeline is long-running)

---

## Documentation

- [docs/README.md](docs/README.md) — plan index, implementation status, roadmap
- [docs/plans/](docs/plans/) — detailed feature and fix plans
- [docs/ideation/](docs/ideation/) — curriculum map UX ideation artifacts

---

## Branches

| Branch | Status |
|--------|--------|
| `main` | Production line — all merged features |
| `feat/course-objectives-extraction` | Merged into `main` (objectives explorer + review fixes) |

**Planned (not yet implemented):** Concept Bridge curriculum map (graph + spreadsheet) — see [plan 006](docs/plans/2026-07-03-006-feat-concept-bridge-curriculum-map-plan.md).
