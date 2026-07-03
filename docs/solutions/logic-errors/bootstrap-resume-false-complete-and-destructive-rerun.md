---
title: Bootstrap resume marked documents complete too early and re-seed wiped pipeline data
date: 2026-07-03
last_refreshed: 2026-07-03
category: logic-errors
module: Bootstrap
problem_type: logic_error
component: development_workflow
symptoms:
  - "Smoke passed while self-study Case 1 guide was still unprocessed"
  - "Re-running db:bootstrap:smoke wiped chunks and alignments via seedCourse"
  - "Framework manifest showed complete despite partial Azure embeddings"
  - "skip-complete skipped documents that only had partial alignments"
  - "Corrupt bootstrap-state.json silently reset to empty defaults"
root_cause: logic_error
resolution_type: code_fix
severity: high
tags:
  - bootstrap
  - checkpoint
  - resume
  - smoke-gate
  - pipeline-status
related_components:
  - process-documents
  - seed-frameworks
  - audit-bootstrap
---

# Bootstrap resume marked documents complete too early and re-seed wiped pipeline data

## Problem

The checkpointed bootstrap path could report success while leaving Case 1 incomplete, destroy hours of pipeline work on a smoke re-run, and treat partially aligned documents as safe to skip — breaking trust in `--skip-complete` and `db:audit-bootstrap`.

## Symptoms

- Smoke verification only checked the faculty guide, not both Case 1 documents.
- Every smoke run called `seedCourse()`, clearing pipeline tables even when the course was already seeded.
- `frameworks.*.complete` was set to `true` unconditionally after seed loops.
- `deriveDocumentPipelineStatus` returned `complete` when any alignment existed, not when all chunks were aligned.
- `loadDocumentPipelineStatusMap` SQL inflated counts via JOIN duplication.
- `loadBootstrapState` swallowed JSON parse errors and returned a fresh default state.

## What Didn't Work

- Relying on a single faculty document for smoke verification — Case 1 smoke processes faculty **and** self-study guides.
- Using alignment row count as a proxy for document completeness — one aligned chunk on a five-chunk doc is not done.
- Size-only curriculum copy skip — same-size file edits were ignored (addressed separately with mtime check in `959e861`).

## Solution

Two commits on `main`:

**`a2970a5` — smoke idempotency and verification**

- `verifySmoke` loops all documents for the case; GI label checks still run on the faculty doc for case 1.
- `seedCourse()` runs only when `courseSeeded` is false; fresh seed clears `processedDocumentIds`.
- Framework progress: `complete: total > 0 && embedded >= total`.
- `loadBootstrapState`: ENOENT -> default; corrupt JSON -> throw; unknown `version` -> default.

**`959e861` — resume accuracy and durability**

- `deriveDocumentPipelineStatus`: requires `alignedChunkCount >= chunkCount` after all chunks embedded.
- Status SQL uses `COUNT(DISTINCT c.id)` and `COUNT(DISTINCT a.chunk_id)`.
- `saveBootstrapState`: write `.tmp` then `rename` for atomic persistence.
- `fullBootstrap`: exit 1 when document table is empty.
- `audit-bootstrap`: lists partial filenames in the failure message.
- `shouldCopyFile`: re-copy when source mtime is newer (same size).

## Why This Works

Smoke gate now matches what smoke actually processes. Idempotent seed preserves existing chunks. Complete flags reflect measurable DB state (embed + per-chunk alignment), so skip-complete and audit agree. Atomic writes prevent truncated JSON on crash. Fail-loud state load avoids silent resume from a blank manifest.

## Prevention

- When adding a bootstrap phase, ask: **what DB rows must exist before marking this phase done?** Test with partial failure (kill mid-alignment) and re-run audit.
- Document pipeline status must be **per-chunk**, not per-alignment-row or per-document heuristic.
- Any destructive seed step needs a **guard flag** (`courseSeeded`, `frameworks.*.complete`) — never unconditional truncate on re-entry.
- Add unit tests for status derivation edge cases (partial embed, partial align, full complete) — see `__tests__/scripts/process-documents.test.ts` (uses `alignedChunkCount`, not alignment row count).
- After code review on bootstrap scripts, run `npm test` and `npm run db:audit-bootstrap` before trusting `--skip-complete`.

## Related Issues

- Plan: `docs/plans/2026-07-03-008-fix-bootstrap-review-findings-plan.md`
- CE doc hygiene: `docs/solutions/conventions/ce-artifacts-git-vs-local.md`
- Index: `docs/README.md` (bootstrap checklist + plan table)
