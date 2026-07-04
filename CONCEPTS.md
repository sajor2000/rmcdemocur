# Concepts

> Shared domain vocabulary for this project — entities, named processes, and status concepts with project-specific meaning. Seeded with core domain vocabulary, then accretes as ce-compound and ce-compound-refresh process learnings; direct edits are fine. Glossary only, not a spec or catch-all.

## Curriculum pipeline

### Document
A faculty guide or self-study guide ingested for one case (1–7). Stored in the database with chunks and alignments produced by the full pipeline.

### Chunk
A text segment of a document after parsing and chunking. Embeddings and alignments attach at chunk granularity — document-level status is derived from chunk coverage.

### Media asset
A figure or video referenced by a curriculum document. Stored in `media_assets` with label, optional file path, and optional `text_for_embed` for search/alignment. Pixels are served for display; only text is embedded.

### Figure registry
The set of parsed figure/video labels extracted from document text (e.g. `Answer Image:`, `Figure 1A`) plus extraction status, used by audit and map linking.

### Alignment
A link between a chunk and a framework node (USMLE domain, AAMC competency, or keyword). A document is not complete until every chunk is embedded and every chunk has at least one alignment.

### Case
One of seven RMD 563 curriculum scenarios. Bootstrap smoke runs case 1 only; full bootstrap processes all cases.

## Bootstrap

### Bootstrap
The scripted path that pushes schema, seeds frameworks and course rows, copies curriculum files, and runs the document pipeline — optionally in smoke-then-full phases with checkpoints.

### Smoke bootstrap
Case-1-only bootstrap gate that validates schema, Azure embed/align, and framework seed before allowing full processing of all documents.

### Bootstrap state
A local JSON manifest tracking phase, framework embed progress, smoke verification, and course-seed flags. Resume logic reads pipeline status from the database; the manifest coordinates orchestration and checkpoints.

### Document pipeline status
One of `empty`, `partial-embed`, `partial-align`, or `complete`. Derived from per-chunk embed and alignment counts — not from alignment row totals alone.

### Skip-complete
Processing mode that skips documents whose pipeline status is already `complete`. Unsafe when complete detection treats partial alignment as done.

## Frameworks

### Framework seed
Incremental upsert of USMLE, AAMC, and keyword taxonomy rows with embedding cache and per-table progress in bootstrap state.

### Embedding cache
Local JSONL cache keyed by model and dimension fingerprint so framework re-seed can skip unchanged embeddings.

## Compound Engineering

### Solution doc
A searchable learning under `docs/solutions/` with YAML frontmatter (`module`, `tags`, `problem_type`). Created by `/ce-compound` after non-trivial fixes.

### Implementation plan
A unified plan under `docs/plans/` with requirements and implementation units. Execution progress comes from git, not checkboxes in the file.

### Compound refresh
A maintenance pass (`ce-compound-refresh`) that audits existing solution docs against the current codebase and updates or marks stale entries.
