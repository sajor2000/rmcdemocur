import "./load-env";
import fs from "fs/promises";
import path from "path";
import { eq } from "drizzle-orm";
import { documents } from "../drizzle/schema";
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

async function main() {
  await ensureCurriculumFiles();
  const db = getDb();
  const docs = await db.select().from(documents).orderBy(documents.caseNumber);
  const onlyCase = process.env.PROCESS_CASE_NUMBER
    ? Number.parseInt(process.env.PROCESS_CASE_NUMBER, 10)
    : null;

  for (const doc of docs) {
    if (onlyCase && doc.caseNumber !== onlyCase) continue;
    const filePath = path.join(process.cwd(), "data/curriculum", doc.filename);
    try {
      await fs.access(filePath);
    } catch {
      console.warn(`File not found, skipping: ${doc.filename}`);
      continue;
    }
    console.log(`Processing ${doc.filename}...`);
    await runFullPipeline({ documentId: doc.id, filePath });
  }
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
