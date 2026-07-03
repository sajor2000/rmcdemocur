import "./load-env";
import fs from "fs/promises";
import path from "path";
import { eq, sql } from "drizzle-orm";
import { documents } from "../drizzle/schema";
import {
  CheckpointTimer,
  loadBootstrapState,
  maybeCheckpoint,
  saveBootstrapState,
  type BootstrapPhase,
  type BootstrapState,
} from "../lib/bootstrap-state";
import { getDb } from "../lib/db";
import { runFullPipeline } from "../lib/pipeline";

const F2F = "2026 Curriculum Inventory Project F2F materials";

const MAPPING = [
  {
    source: `${F2F}/2026.07.02 RMD 563 Faculty Guide 01 David Tilo.pdf`,
    dest: "RMD563_FacultyGuide_Case1_DavidTilo.pdf",
  },
  {
    source: `${F2F}/2026.07.02 RMD 563 Faculty Guide 02 Jessica Donner.docx`,
    dest: "RMD563_FacultyGuide_Case2_JessicaDonner.docx",
  },
  {
    source: `${F2F}/2026.07.02 RMD 563 Faculty Guide 03 Marie Hernandez.docx`,
    dest: "RMD563_FacultyGuide_Case3_MarieHernandez.docx",
  },
  {
    source: `${F2F}/2026.07.02 RMD 563 Faculty Guide 04 John Jackson.docx`,
    dest: "RMD563_FacultyGuide_Case4_JohnJackson.docx",
  },
  {
    source: `${F2F}/2026.07.02 RMD 563 Faculty Guide 05 Evelyn Dixon.docx`,
    dest: "RMD563_FacultyGuide_Case5_EvelynDixon.docx",
  },
  {
    source: `${F2F}/2026.07.02 RMD 563 Faculty Guide 06 Andrew Edwards.docx`,
    dest: "RMD563_FacultyGuide_Case6_AndrewEdwards.docx",
  },
  {
    source: `${F2F}/2026.07.02 RMD 563 Faculty Guide 07 Gloria Lopez-1.docx`,
    dest: "RMD563_FacultyGuide_Case7_GloriaLopez.docx",
  },
  {
    source: `${F2F}/2026.07.02 RMD 563 Self Study Guide 01 David Tilo.docx`,
    dest: "RMD563_SelfStudyGuide_Case1_DavidTilo.docx",
  },
  {
    source: `${F2F}/2026.07.02 RMD 563 Self Study Guide 02 Jessica Donner Vignettes.docx`,
    dest: "RMD563_SelfStudyGuide_Case2_JessicaDonner.docx",
  },
  {
    source: `${F2F}/2026.07.02 RMD 563 Self Study Guide 03 Marie Hernandez.docx`,
    dest: "RMD563_SelfStudyGuide_Case3_MarieHernandez.docx",
  },
  {
    source: `${F2F}/2026.07.02 RMD 563 Self Study Guide 04 John Jackson.docx`,
    dest: "RMD563_SelfStudyGuide_Case4_JohnJackson.docx",
  },
  {
    source: `${F2F}/2026.07.02 RMD 563 Self Study Guide 05 Evelyn Dixon.docx`,
    dest: "RMD563_SelfStudyGuide_Case5_EvelynDixon.docx",
  },
  {
    source: `${F2F}/2026.07.02 RMD 563 Self Study Guide 06 Andrew Edwards.docx`,
    dest: "RMD563_SelfStudyGuide_Case6_AndrewEdwards.docx",
  },
  {
    source: `${F2F}/2026.07.02 RMD 563 Self Study Guide 07 Gloria Lopez-1.docx`,
    dest: "RMD563_SelfStudyGuide_Case7_GloriaLopez.docx",
  },
];

async function ensureCurriculumFiles() {
  const destDir = path.join(process.cwd(), "data/curriculum");
  await fs.mkdir(destDir, { recursive: true });
  for (const { source, dest } of MAPPING) {
    const srcPath = path.join(process.cwd(), source);
    const destPath = path.join(destDir, dest);
    try {
      await fs.copyFile(srcPath, destPath);
      console.log(`Copied ${dest}`);
    } catch {
      console.warn(`Skip copy (missing): ${source}`);
    }
  }
}

function markDocumentProcessed(state: BootstrapState, documentId: number) {
  if (!state.processedDocumentIds.includes(documentId)) {
    state.processedDocumentIds.push(documentId);
  }
}

export async function isDocumentPipelineComplete(documentId: number): Promise<boolean> {
  const db = getDb();
  const result = await db.execute(sql`
    SELECT EXISTS (
      SELECT 1
      FROM alignments a
      JOIN chunks c ON c.id = a.chunk_id
      WHERE c.document_id = ${documentId}
    ) AS complete
  `);
  return Boolean((result.rows[0] as { complete: boolean })?.complete);
}

export async function processDocuments(options?: {
  onlyCase?: number | null;
  skipComplete?: boolean;
  force?: boolean;
  bootstrapPhase?: BootstrapPhase;
}) {
  await ensureCurriculumFiles();
  const db = getDb();
  const docs = await db
    .select({
      id: documents.id,
      caseNumber: documents.caseNumber,
      filename: documents.filename,
    })
    .from(documents)
    .orderBy(documents.caseNumber);

  const tracking = Boolean(options?.bootstrapPhase);
  const state = tracking ? await loadBootstrapState() : undefined;
  const checkpoint = tracking ? new CheckpointTimer() : undefined;
  let dirty = false;

  if (state && options?.bootstrapPhase) {
    state.phase = options.bootstrapPhase;
    await saveBootstrapState(state);
  }

  for (const doc of docs) {
    if (options?.onlyCase && doc.caseNumber !== options.onlyCase) continue;

    const filePath = path.join(process.cwd(), "data/curriculum", doc.filename);
    try {
      await fs.access(filePath);
    } catch {
      console.warn(`File not found, skipping: ${doc.filename}`);
      continue;
    }

    if (
      options?.skipComplete &&
      !options?.force &&
      (await isDocumentPipelineComplete(doc.id))
    ) {
      console.log(`Skip complete: ${doc.filename}`);
      if (state) {
        markDocumentProcessed(state, doc.id);
        dirty = true;
      }
      continue;
    }

    console.log(`Processing ${doc.filename}...`);
    await runFullPipeline({ documentId: doc.id, filePath });

    if (state) {
      markDocumentProcessed(state, doc.id);
      dirty = true;
      await maybeCheckpoint(
        checkpoint!,
        state,
        `processed document ${doc.id} (${doc.filename})`,
      );
    }
  }

  if (state && dirty) {
    await saveBootstrapState(state);
  }

  console.log("Done.");
}

function parseBootstrapPhase(): BootstrapPhase | undefined {
  if (process.argv.includes("--smoke")) return "process-smoke";
  if (process.argv.includes("--full")) return "process-full";
  if (process.argv.includes("--track-bootstrap")) return "process-full";
  return undefined;
}

async function main() {
  const onlyCase = process.env.PROCESS_CASE_NUMBER
    ? Number.parseInt(process.env.PROCESS_CASE_NUMBER, 10)
    : null;

  await processDocuments({
    onlyCase,
    skipComplete: process.argv.includes("--skip-complete"),
    force: process.argv.includes("--force"),
    bootstrapPhase: parseBootstrapPhase(),
  });
}

const isCli = path.basename(process.argv[1] ?? "") === "process-documents.ts";
if (isCli) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
