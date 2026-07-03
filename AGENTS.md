# Agent guide — RushMap AI

Entry point for AI agents and new contributors. **Canonical** for agent read order, repo layout, commands, git workflow, and CE artifact policy. [CLAUDE.md](CLAUDE.md) points here for Claude-specific tooling.

Read in this order before changing code.

## Read first

| Order | File | Why |
|-------|------|-----|
| 1 | [CONCEPTS.md](CONCEPTS.md) | Domain vocabulary (bootstrap, pipeline, document status) |
| 2 | [docs/README.md](docs/README.md) | Doc index, plan status, bootstrap checklist |
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
npm test                          # Vitest unit tests (120+) — run after lib/ or scripts/ changes
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
- **CE session checklist:** After `ce-code-review` or `ce-work`, see [docs/solutions/conventions/ce-artifacts-git-vs-local.md](docs/solutions/conventions/ce-artifacts-git-vs-local.md) for post-session steps (searchable via `/ce-compound`).

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
| `data/curriculum/`, `data/uploads/` | Copied/processed content. **Gitignored.** |
| `.env.local` | Secrets. **Gitignored.** |

### Rule of thumb

- If it answers **why we built it this way** or **what to do next** → git under `docs/` (or root agent docs above).
- If it is **resume state, cache, secrets, or /tmp review output** → local only.

After a `ce-code-review` or `ce-work` session: commit new/updated plans and optional `docs/solutions/` entries; leave `/tmp/.../ce-code-review/` until you finish reading the report, then delete.

## Scope boundaries

- Curriculum PDFs/DOCX and framework binaries live under `data/` locally — not in git.
- Demo course id is **1** (RMD 563 Food to Fuel).
- Upload SSE and API auth have special cases — read `docs/ARCHITECTURE.md` before changing middleware.

## Git workflow

- **Default branch:** `main` only. Branch from `main`, merge via PR.
- **Feature branches:** delete merged branches after push (`git branch -d cursor/<name>` or your branch name).
- **Stashes:** drop obsolete WIP after verifying changes are on `main`.
- **Commit messages:** `feat:`, `fix:`, `docs:`, `refactor:` (see recent history).
