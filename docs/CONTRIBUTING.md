# Contributing

Guidelines for contributors and maintainers of **RushMap AI**.

---

## Workflow

1. Branch from **`main`** using the `cursor/` or `feat/` / `fix/` / `docs/` prefix.
2. Keep commits focused — one logical change per commit when practical.
3. Open a **draft PR** early for review; mark ready when tests pass.
4. Merge via GitHub PR (squash or merge commit per repo default).
5. **Delete the feature branch** locally and on `origin` after merge.

```bash
git checkout main && git pull
git checkout -b cursor/short-description
# … work …
npm test && npm run lint
git push -u origin HEAD
gh pr create --draft --base main
```

---

## Quality gates

| Check | Command |
|-------|---------|
| Unit tests | `npm test` |
| Lint | `npm run lint` |
| E2E (needs `DATABASE_URL`) | `npx playwright test` |
| Visual regression (needs populated DB) | `npx playwright test e2e/visual.spec.ts` |

Run unit tests after any `lib/` or `scripts/` change. Do not run full bootstrap or `db:process` in CI agent sessions unless explicitly requested — Azure cost and runtime.

---

## Documentation

| Change type | Update |
|-------------|--------|
| New route or API | [docs/ARCHITECTURE.md](./ARCHITECTURE.md) |
| Schema change | [docs/SCHEMA.md](./SCHEMA.md) + `drizzle/` |
| Shipped feature | [docs/README.md](./README.md) plan status table |
| Non-trivial fix | `docs/solutions/` via `/ce-compound` |
| Agent entry point | [AGENTS.md](../AGENTS.md) current-state table |

Historical plans under `docs/plans/` are point-in-time artifacts — update the status table in `docs/README.md` rather than rewriting old plans.

---

## Git hygiene

**Keep in git:** agent docs, `docs/`, framework authority JSON, `public/rush-logo.png`.

**Never commit:** `.env.local`, `data/curriculum/`, bootstrap state, embedding cache, CE local config. See [AGENTS.md](../AGENTS.md) CE artifacts table.

**Branch cleanup** (safe after PR merge):

```bash
git fetch --prune
git branch -d cursor/my-feature          # local
git push origin --delete cursor/my-feature   # remote
```

Drop obsolete stashes when the underlying work is merged:

```bash
git stash list
git stash drop stash@{N}
```

---

## Brand assets

Official Rush wordmark: `public/rush-logo.png` (forest green `#006837` on black). Header and footer use black chrome (`rush-black`). Do not invert or filter the logo asset.
