---
title: Vercel First Deploy — CLI Setup and Branch Verification Before Production
date: 2026-07-05
category: docs/solutions/tooling-decisions/
module: deployment
problem_type: tooling_decision
component: tooling
severity: high
applies_when:
  - running vercel deploy --prod (or any production deploy) from an agentic/CLI session in this repo
  - linking a Vercel project in a repo whose directory name contains uppercase characters
  - adding a secret env var to more than one Vercel environment (production, preview, development)
  - provisioning a new Vercel Blob store to attach to the linked project
  - smoke-testing a Vercel preview deployment that sits behind default SSO/deployment protection
  - connecting Vercel to an already-existing Neon Postgres database rather than provisioning a new one
symptoms:
  - "vercel deploy --prod --yes was run while believing the local checkout was still on a long-lived feature branch, only afterward discovering it had moved to main with 28 other PRs merged by other sessions in the meantime"
  - "vercel link --yes failed with an unhelpful 400 error about project names needing to be lowercase and <=100 chars, because the repo directory name (RMCMAP) is uppercase and no --project name was given"
  - "vercel env add NAME production preview development errored with Invalid number of arguments despite looking like it should accept multiple environment targets in one call"
  - "vercel blob create-store errored with Missing required --access flag until --access private or public was passed explicitly"
  - "a plain curl against a preview deployment URL returned a 302 redirect to vercel.com/sso-api instead of the real app response"
related_components:
  - vercel-cli
  - vercel-blob
  - neon-postgres
  - git-workflow
tags: [vercel, vercel-cli, deployment, blob-storage, neon, production-deploy, git-hygiene]
---

# Vercel First Deploy — CLI Setup and Branch Verification Before Production

## Context

RushMap AI had never been deployed to Vercel — no project existed under the team's Vercel account, and prior sessions had managed all secrets and config by hand in `.env.local` rather than through Vercel's tooling (confirmed by searching recent session history: no prior session had done any Vercel project linking, env sync, or Blob provisioning — a genuine clean slate). This session performed the first-ever deploy end-to-end using the Vercel CLI from inside an agentic session (rather than the dashboard), covering project linking, environment variable provisioning, Blob storage setup, and promotion to production.

Along the way it hit several CLI-specific rough edges (case-sensitive project naming, single-environment-per-call env var syntax, a missing required flag, deployment-protection walls on preview URLs) and, most importantly, a near-miss just before the production promotion: the operator believed the checkout was still on a feature branch from earlier in the session, but `main` had actually moved forward by 28 merged PRs in the interim, and `vercel deploy --prod` would have shipped whatever was currently checked out, PR review or not. The deploy turned out to be safe, but only after being verified with evidence, not assumed.

## Guidance

**1. Link the project with an explicit, lowercase project name.** Vercel derives a default project name from the current directory name; if that name contains uppercase letters (e.g. a repo checked out as `RMCMAP`), linking fails outright. Always pass `--project` explicitly:

```bash
# Fails when run from a directory with uppercase letters:
vercel link --yes
# Error: Project names can be up to 100 characters long and must be lowercase.
#   They can include letters, digits, and the following characters: '.', '_', '-'.
#   However, they cannot contain the sequence '---'. (400)

# Fix: supply an explicit, valid, lowercase name
vercel link --yes --project rushmap-ai
```

**2. Push each environment variable once per target environment — never all three in one call.** `vercel env add` takes exactly one environment target (plus an optional git-branch as a 4th positional arg); it is not a multi-value flag. Pipe the secret value through stdin rather than typing it as a CLI arg or having the agent print it, so it never lands in shell history or the agent's own visible tool-call output:

```bash
# A brand-new project starts with zero env vars — confirm before assuming anything carries over
vercel env ls

# Push one var to one environment at a time, value piped via stdin
for env in production preview development; do
  echo "$DATABASE_URL" | vercel env add DATABASE_URL "$env"
done

# Repeat per variable (AZURE_OPENAI_API_KEY, AZURE_OPENAI_ENDPOINT, etc.)

# Verify the actual state afterward rather than pattern-matching CLI stdout
vercel env ls
```

Pushing local secrets into a new cloud secret store is a distinct authorization scope from "use the CLI to deploy" — expect (and respect) a permission gate that requires explicit confirmation before the first `vercel env add` of a real credential.

**3. Create Blob stores with `vercel blob`, not `vercel storage`, and always pass `--access`.** `vercel storage` is not a valid subcommand in current CLI versions; the command family is `vercel blob <cmd>` (found under "Advanced" in `vercel --help`). `--access` (`public` or `private`) is mandatory:

```bash
# Fails: missing_arguments
vercel blob create-store rushmap-media
# Error: Missing required --access flag. Must be 'public' or 'private'.

# Fix: match the access level the app's code already assumes
vercel blob create-store rushmap-media --access private --yes
```

When a project is already linked (`.vercel/project.json` present), this auto-connects the store and auto-populates `BLOB_READ_WRITE_TOKEN` into all three environments — no manual env-var push needed for Blob specifically.

**4. Smoke-test protected preview/production URLs with `vercel curl`, not plain `curl`.** Vercel's default Deployment Protection returns an SSO redirect to any unauthenticated request, even for the project owner hitting an API route directly:

```bash
# Plain curl hits the SSO wall, not the app:
curl -s -D - -o /tmp/out.bin "https://<preview-url>/api/media/231"
# HTTP/2 302
# location: https://vercel.com/sso-api?url=...
# set-cookie: _vercel_sso_nonce=...

# Fix: vercel curl injects a deployment-protection-bypass token for the authenticated CLI session
vercel curl /api/media/231 --deployment <preview-url> -- -s -D - -o /tmp/out.bin
# HTTP/2 200
# content-type: image/png
```

**5. Before `vercel deploy --prod`, verify the branch state with evidence — don't trust memory of "which branch I was on."**

```bash
git branch --show-current          # is this actually the production/default branch?
git status --short                 # clean working tree, no uncommitted drift?
git rev-parse HEAD                 # ...
git rev-parse origin/main          # ...does HEAD match the remote default branch exactly?
git log --oneline main..HEAD       # any local commits not yet merged upstream? (should be empty on main)
gh pr list --state open            # any open PRs representing work not yet in this branch?

vercel deploy --prod --yes
# then re-run the vercel curl smoke test against the actual production URL, not just the earlier preview URL
```

**6. Prefer a one-time manual env var copy over a Marketplace integration when a database is already provisioned and working elsewhere.** Vercel offers `vercel install neon` to provision/connect Postgres the same managed way Blob was connected here, but running it blind risks creating a brand-new, empty Neon project rather than linking the existing one. When the existing `DATABASE_URL` is already confirmed working (real data, correct schema), copying it manually into Vercel's env vars is the lower-risk choice; only reach for the Marketplace integration after confirming it can link the existing resource rather than provision a new one.

## Why This Matters

- **Piping secrets through stdin (`echo "$VALUE" | vercel env add ...`) keeps credentials out of shell history and out of the agent's own visible tool-call arguments.** Anything typed as a literal CLI argument gets logged in both places; anything piped through stdin only ever appears as Vercel's own confirmation line (`✓ Added ... Environments: Production`), which is a far smaller exposure surface for a real database password or API key.
- **The single-environment-per-call constraint on `vercel env add`, the missing-flag error on `vercel blob create-store`, and the case-sensitive project-name rule are all "wastes a debug cycle if you guess" traps.** Each has an exact, discoverable failure mode (via `--help` or the error message itself) — the fix is cheap once you know it, but assuming the CLI behaves like other tools (multi-value flags, optional access levels, case-insensitive names) costs a full failed round-trip first.
- **The branch/PR verification step exists because `vercel deploy --prod` will ship whatever is currently checked out locally — it has no awareness of your intended source branch, your team's PR review process, or how much the remote has moved since you last checked.** In this session, main had advanced by 28 merged PRs since the operator last looked; had the checkout actually been the stale feature branch the operator believed it to be, `--prod` would have silently reverted production to a stale, unreviewed state and effectively bypassed the entire PR-review gate the rest of the team relies on. The near-miss cost nothing here only because the belief happened to be wrong in a harmless direction (HEAD actually *was* `main`) — the check has to be run regardless of which way you expect it to resolve, precisely because "I'm pretty sure I'm on the right branch" is exactly the belief that was wrong.

## When to Apply

- **Project linking, per-environment env var pushes, and Blob store creation with `--access`**: apply during first-time Vercel project setup for any app that uses Neon Postgres + Vercel Blob (or any external secret store) — these are one-time bootstrap steps, but the command syntax lessons (one env per call, mandatory `--access`, explicit lowercase project name) generalize to any future project link/env/blob work on any repo.
- **`vercel curl` for smoke-testing**: apply any time a deployment needs to be verified against a real route and Deployment Protection is enabled (the default) — true for every preview and production deployment, not just the first one.
- **The branch/PR pre-deploy verification checklist**: apply to **every** future `vercel deploy --prod` invocation from an agentic session on this repo or similar repos, not only first-time setup. Treat "which branch am I actually on, does it match origin exactly, and are there open PRs I'm not accounting for" as a mandatory gate before any production promotion, regardless of how recently the session checked.

## Examples

**Env var push — wrong then right:**

```bash
# Attempt 1: all three environments in one invocation
vercel env add DATABASE_URL production preview development
# Error: Invalid number of arguments. Usage: vercel env add <name> <production | preview | development> <gitbranch>

# Fix: loop, one environment per call, value piped via stdin
for env in production preview development; do
  echo "$DATABASE_URL" | vercel env add DATABASE_URL "$env"
done
# ✓ Added Environment Variable DATABASE_URL to Project rushmap-ai (production)
# ✓ Added Environment Variable DATABASE_URL to Project rushmap-ai (preview)
# ✓ Added Environment Variable DATABASE_URL to Project rushmap-ai (development)
```

Note: a scripted check that grepped CLI output for the literal phrase "Added Environment Variable" reported false failures for every variable — the actual CLI output is `✓ Added` (with a checkmark glyph), not that phrase. Verify against a real run's actual output, or just re-check with `vercel env ls`, rather than trusting an assumed success string.

**Smoke test — wrong then right:**

```bash
# Bare curl hits Vercel's Deployment Protection SSO wall, not the app
curl -s -D - -o /tmp/out.bin "https://rushmap-ai-git-preview.vercel.app/api/media/231"
# HTTP/2 302
# location: https://vercel.com/sso-api?url=...
# set-cookie: _vercel_sso_nonce=...

# vercel curl injects the deployment-protection-bypass token automatically
vercel curl /api/media/231 --deployment https://rushmap-ai-git-preview.vercel.app -- -s -D - -o /tmp/out.bin
# HTTP/2 200
# content-type: image/png
# (downloaded bytes verified as a real 816x1056 PNG via `file`)
```

## Related

- No existing `docs/solutions/` doc overlaps with this topic (checked against all current entries — closest is `conventions/ce-artifacts-git-vs-local.md`, a distinct git/CE-artifact hygiene convention, not a deployment convention).
- `docs/solutions/logic-errors/bootstrap-resume-false-complete-and-destructive-rerun.md` — unrelated pipeline resume-state doc, no overlap.
