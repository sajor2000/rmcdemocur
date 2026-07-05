import "./load-env";
import path from "path";
import { sql } from "drizzle-orm";
import {
  alignments,
  chunkMedia,
  chunks,
  courseObjectives,
  courses,
  documents,
  gapSummary,
  keywordTags,
  mediaAssets,
  processingJobs,
} from "../drizzle/schema";
import { getDb } from "../lib/db";

const DEMO_DOCUMENTS = [
  {
    filename: "RMD563_FacultyGuide_Case1_DavidTilo.pdf",
    fileType: "pdf",
    caseNumber: 1,
    caseTitle: "David Tilo",
    diagnosis: "GERD with gastric ulcer",
  },
  {
    filename: "RMD563_FacultyGuide_Case2_JessicaDonner.pdf",
    fileType: "pdf",
    caseNumber: 2,
    caseTitle: "Jessica Donner",
    diagnosis: "Pediatric GI/nutrition case",
  },
  {
    filename: "RMD563_FacultyGuide_Case3_MarieHernandez.docx",
    fileType: "docx",
    caseNumber: 3,
    caseTitle: "Marie Hernandez",
    diagnosis: "Bacterial meningitis",
  },
  {
    filename: "RMD563_FacultyGuide_Case4_JohnJackson.docx",
    fileType: "docx",
    caseNumber: 4,
    caseTitle: "John Jackson",
    diagnosis: "Alcohol-related cirrhosis with ascites, portal hypertension, hepatic encephalopathy",
  },
  {
    filename: "RMD563_FacultyGuide_Case5_EvelynDixon.docx",
    fileType: "docx",
    caseNumber: 5,
    caseTitle: "Evelyn Dixon",
    diagnosis: "Endocrine/metabolic case",
  },
  {
    filename: "RMD563_FacultyGuide_Case6_AndrewEdwards.docx",
    fileType: "docx",
    caseNumber: 6,
    caseTitle: "Andrew Edwards",
    diagnosis: "Cardiovascular case",
  },
  {
    filename: "RMD563_FacultyGuide_Case7_GloriaLopez.docx",
    fileType: "docx",
    caseNumber: 7,
    caseTitle: "Gloria Lopez",
    diagnosis: "Renal/urinary case",
  },
  {
    filename: "RMD563_SelfStudyGuide_Case1_DavidTilo.docx",
    fileType: "docx",
    caseNumber: 1,
    caseTitle: "David Tilo (Self-Study)",
    diagnosis: "GERD with gastric ulcer",
  },
  {
    filename: "RMD563_SelfStudyGuide_Case2_JessicaDonner.docx",
    fileType: "docx",
    caseNumber: 2,
    caseTitle: "Jessica Donner (Self-Study)",
    diagnosis: "Pediatric GI/nutrition case",
  },
  {
    filename: "RMD563_SelfStudyGuide_Case3_MarieHernandez.docx",
    fileType: "docx",
    caseNumber: 3,
    caseTitle: "Marie Hernandez (Self-Study)",
    diagnosis: "Bacterial meningitis",
  },
  {
    filename: "RMD563_SelfStudyGuide_Case4_JohnJackson.docx",
    fileType: "docx",
    caseNumber: 4,
    caseTitle: "John Jackson (Self-Study)",
    diagnosis: "Alcohol-related cirrhosis with ascites, portal hypertension, hepatic encephalopathy",
  },
  {
    filename: "RMD563_SelfStudyGuide_Case5_EvelynDixon.docx",
    fileType: "docx",
    caseNumber: 5,
    caseTitle: "Evelyn Dixon (Self-Study)",
    diagnosis: "Endocrine/metabolic case",
  },
  {
    filename: "RMD563_SelfStudyGuide_Case6_AndrewEdwards.docx",
    fileType: "docx",
    caseNumber: 6,
    caseTitle: "Andrew Edwards (Self-Study)",
    diagnosis: "Cardiovascular case",
  },
  {
    filename: "RMD563_SelfStudyGuide_Case7_GloriaLopez.docx",
    fileType: "docx",
    caseNumber: 7,
    caseTitle: "Gloria Lopez (Self-Study)",
    diagnosis: "Renal/urinary case",
  },
];

export async function seedCourse(): Promise<void> {
  const db = getDb();
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);

  // FK-safe wipe: pipeline artifacts before documents/courses
  await db.delete(alignments);
  await db.delete(keywordTags);
  await db.delete(chunkMedia);
  await db.delete(mediaAssets);
  await db.delete(chunks);
  await db.delete(courseObjectives);
  await db.delete(processingJobs);
  // Permanent no-op: nothing writes gap_summary anymore (coverage is computed
  // live from alignments/chunks/documents). Left in the wipe order in case the
  // table is ever repopulated by something else; always deletes zero rows today.
  await db.delete(gapSummary);
  await db.delete(documents);
  await db.delete(courses);

  // Keep demo URLs at /courses/1 after re-seed (Postgres serial does not reset on DELETE).
  await db.execute(sql`ALTER SEQUENCE courses_id_seq RESTART WITH 1`);
  await db.execute(sql`ALTER SEQUENCE documents_id_seq RESTART WITH 1`);

  const [course] = await db
    .insert(courses)
    .values({
      code: "RMD 563",
      title: "Food to Fuel",
      director: "Dr. Kathryn Solka, PhD (kathryn_a_solka@rush.edu)",
    })
    .returning();

  const docs = await db
    .insert(documents)
    .values(
      DEMO_DOCUMENTS.map((d) => ({
        courseId: course.id,
        ...d,
      })),
    )
    .returning();

  console.log(
    `Seeded course ${course.id} with ${docs.length} documents. Run npm run db:seed-frameworks (if needed) then npm run db:process.`,
  );
}

async function main() {
  await seedCourse();
}

const isCli = path.basename(process.argv[1] ?? "") === "seed.ts";
if (isCli) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
