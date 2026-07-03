# Agent guide — RushMap AI

Entry point for AI agents and new contributors. Read in this order before changing code.

## Read first

| Order | File | Why |
|-------|------|-----|
| 1 | [CONCEPTS.md](CONCEPTS.md) | Domain vocabulary (bootstrap, pipeline, document status) |
| 2 | [docs/README.md](docs/README.md) | Doc index, plan status, bootstrap checklist, CE git vs local |
| 3 | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Pipeline stages, API routes, module map |
| 4 | [docs/SCHEMA.md](docs/SCHEMA.md) | Postgres tables and framework ID conventions |

Before debugging bootstrap, pipeline, or chunking: search [docs/solutions/](docs/solutions/) by `module`, `tags`, or `problem_type` in YAML frontmatter.

Active work: [docs/plans/](docs/plans/) — check the status table in `docs/README.md`. Default branch is **`main`** only.

## Repository layout

```
app/              Next.js App Router — pages and API routes
components/       React UI (map, gaps, objectives, layout)
lib/              Pipeline, parsers, Azure AI, chunker, bootstrap state
scripts/          CLIs — bootstrap, seed, process, audit (run via npm scripts)
drizzle/          Schema
__tests__/        Vitest — mirror lib/ and scripts/ coverage
docs/
  ARCHITECTURE.md SCHEMA.md   Engineering truth
  plans/                      Implementation plans (ce-plan / ce-work)
  solutions/                  Past fixes and conventions (ce-compound)
  ideation/                   UX exploration HTML
data/             Local only (gitignored) — curriculum copies, frameworks, bootstrap state
.compound-engineering/
  config.example.yaml         Committed template
  config.local.yaml           Personal CE settings (gitignored)
```

## Commands (common)

```bash
npm test                          # 57+ unit tests — run after lib/ or scripts/ changes
npm run lint
npm run db:push                   # Push Drizzle schema to Neon
npm run db:bootstrap:smoke        # Case 1 gate (schema + Azure + verify)
npm run db:bootstrap:full         # All documents (after smoke passes)
npm run db:audit-bootstrap        # Read-only manifest / DB reconcile
npm run dev                       # http://localhost:3000/courses/1
```

Do **not** run long bootstrap or full `db:process` unless the user explicitly asks — Azure cost and runtime.

## Conventions

- **Bootstrap resume:** Document `complete` means all chunks embedded and all chunks aligned. See `docs/solutions/logic-errors/bootstrap-resume-false-complete-and-destructive-rerun.md`.
- **Secrets:** `.env.local` only — never commit. See `.env.local.example`.
- **Plans vs progress:** Plans do not store checkboxes; derive progress from git and `docs/README.md` status table.
- **CE artifacts:** Commit `docs/plans/` and `docs/solutions/`; keep `data/bootstrap-state.json`, caches, and `/tmp/compound-engineering/` local. See `docs/solutions/conventions/ce-artifacts-git-vs-local.md`.

## Scope boundaries

- Curriculum PDFs/DOCX and framework binaries live under `data/` locally — not in git.
- Demo course id is **1** (RMD 563 Food to Fuel).
- Upload SSE and API auth have special cases — read `docs/ARCHITECTURE.md` before changing middleware.

## Git workflow

- Branch from `main`, merge via PR.
- Delete feature branches after merge.
- Commit messages: `feat:`, `fix:`, `docs:`, `refactor:` (see recent history).
