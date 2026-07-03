# RushMap AI

AI-powered curriculum mapping demo for Rush Medical College (RMD 563 — Food to Fuel).

## Stack

- Next.js 14 (App Router) + Tailwind + shadcn-style UI
- Neon Postgres + pgvector + Drizzle ORM
- Azure AI Foundry — `gpt-4.1` (align + search) + `text-embedding-3-large` @ 1536 dims (RAG)

## Setup

1. Copy `.env.local.example` to `.env.local` and fill in credentials.
2. `npm install`
3. Place authority framework files (or run copy script):
   - `npm run copy:frameworks` — copies from `Curriculum Map - AI project/` → `data/frameworks/`
4. `npm run db:push`
5. `npm run db:seed-frameworks` — parse USMLE 2025 PDF + AAMC keywords xlsx into Postgres (adds `--skip-embeddings` without Azure)
6. `npm run db:seed` — seed RMD 563 course + seven faculty guide metadata rows
7. `npm run db:process` — copy curriculum PDFs/DOCX, parse, embed, align against imported frameworks (requires Azure). Smoke first: `PROCESS_CASE_NUMBER=1 npm run db:process`

**Quality-tier models (recommended):** `gpt-4.1` + `text-embedding-3-large` with `AZURE_OPENAI_EMBEDDING_DIMENSIONS=1536` (matches `vector(1536)` in Postgres). After changing chat or embedding deployments, re-run in order: `db:seed-frameworks` → `db:seed` → `db:process` (or `npm run setup`). `db:realign` only when chunk embeddings are unchanged.

### Framework sources (`data/frameworks/`)

| Source (`Curriculum Map - AI project/`) | Destination |
|----------------------------------------|-------------|
| USMLE_Content_Outline_0 (1).pdf | usmle-content-outline-2025.pdf |
| meded-curriculum-keywords-083024.xlsx | aamc-curriculum-keywords-083024.xlsx |
| meded-curriculum-inventory-guidebook_0.pdf | aamc-curriculum-inventory-guidebook.pdf |

Parsed JSON artifacts are written to `data/frameworks/parsed/` on seed. PDF/xlsx binaries are gitignored by default.

### Curriculum file mapping

| Source (F2F materials) | Destination (`data/curriculum/`) |
|------------------------|--------------------------------|
| Faculty Guide 01 David Tilo.pdf | RMD563_FacultyGuide_Case1_DavidTilo.pdf |
| Faculty Guide 02 Jessica Donner.docx | RMD563_FacultyGuide_Case2_JessicaDonner.docx |
| Faculty Guide 03 Marie Hernandez.docx | RMD563_FacultyGuide_Case3_MarieHernandez.docx |
| Faculty Guide 04 John Jackson.docx | RMD563_FacultyGuide_Case4_JohnJackson.docx |
| Faculty Guide 05 Evelyn Dixon.docx | RMD563_FacultyGuide_Case5_EvelynDixon.docx |
| Faculty Guide 06 Andrew Edwards.docx | RMD563_FacultyGuide_Case6_AndrewEdwards.docx |
| Faculty Guide 07 Gloria Lopez.docx | RMD563_FacultyGuide_Case7_GloriaLopez.docx |

`npm run db:process` copies these automatically when source files exist.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm test` | Vitest unit tests |
| `npm run db:push` | Push Drizzle schema to Neon |
| `npm run copy:frameworks` | Copy USMLE/AAMC authority files into `data/frameworks/` |
| `npm run db:seed-frameworks` | Parse and seed framework tables from authority files |
| `npm run db:seed` | Seed course + seven document metadata rows |
| `npm run db:process` | Copy, parse, embed, align all faculty guides |
| `npm run db:realign` | Re-run alignment + gap recompute without re-embedding chunks |

## Deploy (Vercel)

1. Push to [github.com/sajor2000/rmcdemocur](https://github.com/sajor2000/rmcdemocur)
2. Connect Vercel project; add env vars from `.env.local.example`
3. Run seed + process locally before demo (recommended)

## Demo routes

- `/` — Landing
- `/upload` — Document upload + SSE processing
- `/courses/1` — Dashboard
- `/courses/1/map` — Tri-directional curriculum map
- `/courses/1/gaps` — Gap analysis + CSV export
- `/courses/1/search` — Natural language search
- `/about` — Product explainer
