# Documented solutions

Searchable learnings from `/ce-compound`. Each file has YAML frontmatter: `module`, `problem_type`, `tags`, `component`.

## Index

| Doc | Type | Last refreshed | Summary |
|-----|------|----------------|---------|
| [logic-errors/bootstrap-resume-false-complete-and-destructive-rerun.md](logic-errors/bootstrap-resume-false-complete-and-destructive-rerun.md) | bug | 2026-07-03 | Smoke/skip-complete false positives, destructive re-seed, atomic bootstrap state |
| [conventions/ce-artifacts-git-vs-local.md](conventions/ce-artifacts-git-vs-local.md) | convention | 2026-07-03 | What to commit vs keep local for CE skills |

## How to search

```bash
# By keyword
rg -l "bootstrap" docs/solutions/

# By frontmatter
rg "problem_type: logic_error" docs/solutions/
rg "tags:.*pipeline" docs/solutions/
```

Add a new doc with `/ce-compound` after non-trivial fixes — do not duplicate content that belongs in `ARCHITECTURE.md` or `SCHEMA.md`.
