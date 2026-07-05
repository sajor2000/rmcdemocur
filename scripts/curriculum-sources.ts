import fs from "fs/promises";
import path from "path";

const F2F_DIR = "2026 Curriculum Inventory Project F2F materials";

export type CurriculumFileMapping = {
  source: string;
  dest: string;
  caseNumber: number;
};

export const FACULTY_GUIDES: CurriculumFileMapping[] = [
  {
    source: `${F2F_DIR}/2026.07.02 RMD 563 Faculty Guide 01 David Tilo.pdf`,
    dest: "RMD563_FacultyGuide_Case1_DavidTilo.pdf",
    caseNumber: 1,
  },
  {
    source: `${F2F_DIR}/2026.07.02 RMD 563 Faculty Guide 02 Jessica Donner.pdf`,
    dest: "RMD563_FacultyGuide_Case2_JessicaDonner.pdf",
    caseNumber: 2,
  },
  {
    source: `${F2F_DIR}/2026.07.02 RMD 563 Faculty Guide 03 Marie Hernandez.docx`,
    dest: "RMD563_FacultyGuide_Case3_MarieHernandez.docx",
    caseNumber: 3,
  },
  {
    source: `${F2F_DIR}/2026.07.02 RMD 563 Faculty Guide 04 John Jackson.docx`,
    dest: "RMD563_FacultyGuide_Case4_JohnJackson.docx",
    caseNumber: 4,
  },
  {
    source: `${F2F_DIR}/2026.07.02 RMD 563 Faculty Guide 05 Evelyn Dixon.docx`,
    dest: "RMD563_FacultyGuide_Case5_EvelynDixon.docx",
    caseNumber: 5,
  },
  {
    source: `${F2F_DIR}/2026.07.02 RMD 563 Faculty Guide 06 Andrew Edwards.docx`,
    dest: "RMD563_FacultyGuide_Case6_AndrewEdwards.docx",
    caseNumber: 6,
  },
  {
    source: `${F2F_DIR}/2026.07.02 RMD 563 Faculty Guide 07 Gloria Lopez-1.docx`,
    dest: "RMD563_FacultyGuide_Case7_GloriaLopez.docx",
    caseNumber: 7,
  },
];

export const SELF_STUDY_GUIDES: CurriculumFileMapping[] = [
  {
    source: `${F2F_DIR}/2026.07.02 RMD 563 Self Study Guide 01 David Tilo.docx`,
    dest: "RMD563_SelfStudyGuide_Case1_DavidTilo.docx",
    caseNumber: 1,
  },
  {
    source: `${F2F_DIR}/2026.07.02 RMD 563 Self Study Guide 02 Jessica Donner Vignettes.docx`,
    dest: "RMD563_SelfStudyGuide_Case2_JessicaDonner.docx",
    caseNumber: 2,
  },
  {
    source: `${F2F_DIR}/2026.07.02 RMD 563 Self Study Guide 03 Marie Hernandez.docx`,
    dest: "RMD563_SelfStudyGuide_Case3_MarieHernandez.docx",
    caseNumber: 3,
  },
  {
    source: `${F2F_DIR}/2026.07.02 RMD 563 Self Study Guide 04 John Jackson.docx`,
    dest: "RMD563_SelfStudyGuide_Case4_JohnJackson.docx",
    caseNumber: 4,
  },
  {
    source: `${F2F_DIR}/2026.07.02 RMD 563 Self Study Guide 05 Evelyn Dixon.docx`,
    dest: "RMD563_SelfStudyGuide_Case5_EvelynDixon.docx",
    caseNumber: 5,
  },
  {
    source: `${F2F_DIR}/2026.07.02 RMD 563 Self Study Guide 06 Andrew Edwards.docx`,
    dest: "RMD563_SelfStudyGuide_Case6_AndrewEdwards.docx",
    caseNumber: 6,
  },
  {
    source: `${F2F_DIR}/2026.07.02 RMD 563 Self Study Guide 07 Gloria Lopez-1.docx`,
    dest: "RMD563_SelfStudyGuide_Case7_GloriaLopez.docx",
    caseNumber: 7,
  },
];

export const ALL_CURRICULUM_FILES = [...FACULTY_GUIDES, ...SELF_STUDY_GUIDES];

export async function shouldCopyFile(
  srcPath: string,
  destPath: string,
): Promise<boolean> {
  try {
    const [srcStat, destStat] = await Promise.all([
      fs.stat(srcPath),
      fs.stat(destPath),
    ]);
    if (srcStat.size !== destStat.size) return true;
    return srcStat.mtimeMs > destStat.mtimeMs;
  } catch {
    return true;
  }
}

export async function copyCurriculumFiles(options?: {
  onlyCase?: number | null;
  destDir?: string;
  includeSelfStudy?: boolean;
}): Promise<number> {
  const destDir = options?.destDir ?? path.join(process.cwd(), "data/curriculum");
  await fs.mkdir(destDir, { recursive: true });

  const includeSelfStudy = options?.includeSelfStudy ?? true;
  let files = includeSelfStudy ? ALL_CURRICULUM_FILES : FACULTY_GUIDES;
  if (options?.onlyCase != null) {
    files = files.filter((f) => f.caseNumber === options.onlyCase);
  }

  let copied = 0;
  for (const { source, dest } of files) {
    const srcPath = path.join(process.cwd(), source);
    const destPath = path.join(destDir, dest);
    try {
      if (!(await shouldCopyFile(srcPath, destPath))) {
        continue;
      }
      await fs.copyFile(srcPath, destPath);
      console.log(`Copied ${dest}`);
      copied++;
    } catch {
      console.warn(`Skip copy (missing): ${source}`);
    }
  }
  return copied;
}
