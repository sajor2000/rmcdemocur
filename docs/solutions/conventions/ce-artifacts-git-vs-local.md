---
title: Compound Engineering artifacts — commit decisions to git, keep runtime state local
date: 2026-07-03
category: conventions
module: Documentation
problem_type: convention
component: documentation
severity: low
applies_when:
  - "After ce-plan, ce-code-review, ce-compound, or ce-work sessions"
  - "Onboarding a teammate or agent to this repo's CE workflow"
  - "Deciding whether to git add a new file under docs/ or data/"
tags:
  - compound-engineering
  - docs-solutions
  - gitignore
  - bootstrap-state
---

# Compound Engineering artifacts — commit decisions to git, keep runtime state local

## Context

This repo uses Compound Engineering skills (`ce-plan`, `ce-code-review`, `ce-compound`, `ce-work`). Those skills produce **decision artifacts** (plans, learnings) and **runtime artifacts** (checkpoints, review JSON in `/tmp`, caches). Mixing them in git creates noise, leaks machine state, or loses knowledge agents need on the next run.

## Guidance

### Commit to git

| Path | Why |
|------|-----|
| `docs/plans/*.md` | Implementation intent and units; `ce-work` discovers these |
| `docs/solutions/**/*.md` | Searchable learnings from `/ce-compound` |
| `docs/ideation/*.html` | Early UX/product exploration |
| `docs/ARCHITECTURE.md`, `docs/SCHEMA.md`, `docs/README.md` | Engineering truth |
| `.compound-engineering/config.example.yaml` | Shared defaults without secrets |

### Keep local (gitignored or ephemeral)

| Path | Why |
|------|-----|
| `.compound-engineering/config.local.yaml` | Personal CE preferences |
| `/tmp/compound-engineering/` | Code-review run artifacts — read, then delete |
| `data/bootstrap-state.json` | Resume checkpoint for long bootstrap |
| `data/frameworks/.embedding-cache.jsonl` | Embedding cache during seed |
| `data/curriculum/`, `data/uploads/` | Copied/processed content |
| `.env.local` | Secrets |

### After each CE session

1. Commit new or updated plans and solution docs.
2. Update the plan table in `docs/README.md` when status changes.
3. Do **not** commit `/tmp` review dirs or bootstrap state.
4. Optional: run `/ce-compound` when a fix was non-obvious.

## Why This Matters

Agents and teammates search `docs/solutions/` by `module`, `tags`, and `problem_type` frontmatter. If learnings stay local, the same bootstrap or pipeline bugs get re-discovered. If runtime state is committed, merges conflict on machine-specific JSON and caches.

## When to Apply

- End of any session that used CE skills on this repo.
- Before opening a PR that touches bootstrap or pipeline scripts.
- When adding new ignored paths under `data/` — document them in `docs/README.md` CE section.

## Examples

**Good:** Commit `docs/solutions/logic-errors/bootstrap-resume-false-complete-and-destructive-rerun.md` after fixing P1–P3; leave `data/bootstrap-state.json` untracked.

**Bad:** Commit `/tmp/compound-engineering/ce-code-review/.../review.json` or `config.local.yaml` with `plan_skip_scoping_confirm: true`.

## Related

- `docs/README.md` — "Compound Engineering — what lives in git vs local"
- `.gitignore` — bootstrap state, caches, curriculum copies
- `.compound-engineering/config.example.yaml` — copy to `config.local.yaml` locally
