# Demo review guide

Checklist for medical-education stakeholders reviewing the **RMD 563: Food to Fuel** demo.

**Demo entry:** `/courses/1` (course dashboard)  
**Program rollup:** `/program`  
**About / scope:** `/about`

---

## What RushMap AI does

RushMap ingests faculty guides and self-study materials, segments them into teachable chunks, and uses Azure AI to **suggest** how each segment relates to:

- **AAMC PCRS (2013)** — competency domains
- **13 Core EPAs**
- **USMLE 2025 Content Outline**

Every AI alignment is labeled, includes confidence + rationale + source excerpt, and can be **approved or rejected** in the curriculum map drawer.

**Coverage is intensity, not a lone “% covered.”** Topics are classified by how many **distinct sessions/documents** address them: *Not addressed → Introduced → Reinforced → Strong → Heavily covered*. Tooltips and `MethodExplainer` boxes describe the method on each surface.

---

## Routes to review

| Area | Path | What to check |
|------|------|---------------|
| Course dashboard | `/courses/1` | Metrics, AAMC chart, USMLE heatmap |
| Curriculum map | `/courses/1/map` | Tri-directional trees, case filters, alignment drawer |
| Learning objectives | `/courses/1/objectives` | EO/TO codes, filters, CSV export |
| Case analytics | `/courses/1/cases/{1–7}` | Per-case coverage, faculty vs self-study lens |
| Gap analysis | `/courses/1/gaps` | Gap cards, intensity table, CSV export |
| Search | `/courses/1/search` | NL Q&A with cited chunks |
| Program view | `/program` | M1 rollup, coverage + objectives exports |

---

## Sanity-check list

### Trust and transparency

- [ ] AI-generated labels visible on alignments
- [ ] Numbers have tooltips or method notes a non-technical educator can follow
- [ ] Alignments drill to real source excerpts (and figures where extracted)
- [ ] Approve/reject workflow in the map drawer feels usable

### Course dashboard

- [ ] 7 cases / 14 documents reflected in metrics
- [ ] AAMC and USMLE summaries directionally plausible
- [ ] Recent alignments cite recognizable case content

### Curriculum map

- [ ] Case filters (1–7) change the view sensibly
- [ ] Selection links Rush topics to framework nodes (and vice versa)
- [ ] Drawer excerpts match expected case/session
- [ ] Faculty-guide figures appear where diagrams exist (DOCX extracts)
- [ ] Spot-check: approve some alignments, reject others — note why

### Learning objectives

- [ ] EO-#### / TO-#### codes present where guides define them
- [ ] Objective text matches source guides
- [ ] CSV export opens cleanly in Excel

### Case analytics

- [ ] Per-case metrics match pedagogical expectations
- [ ] Faculty vs self-study lens tells a coherent story
- [ ] Links to map/objectives preserve case context

### Gap analysis

- [ ] “Not addressed” topics are plausible gaps (or explain false positives)
- [ ] Intensity labels match cross-session recurrence
- [ ] CSV export is committee-ready

### Search

- [ ] Three real faculty questions return cited, relevant chunks
- [ ] Low-confidence / empty results are honest

### Program view

- [ ] Rollup metrics sensible for M1 scope
- [ ] Exports download with readable headers

### Known demo limits

- [ ] Single course, no login — not multi-tenant production
- [ ] Alignments are suggestions until faculty validate
- [ ] PDF figure coverage weaker than faculty DOCX
- [ ] Flag any chunks that feel cut mid-thought

---

## Feedback format

When reporting issues, include:

1. **Page** (e.g. Map, Case 3 analytics)
2. **Expected** vs **observed**
3. **Case / document** if applicable
4. **Screenshot** when helpful
