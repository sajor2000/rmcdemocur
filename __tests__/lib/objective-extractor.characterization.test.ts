import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { parseDocument } from "@/lib/document-parser";
import { extractObjectivesFromText } from "@/lib/objective-extractor";

// Corpus characterization lock. Pins per-document objective counts on the real
// self-study guides so any parser change that shifts extraction on a working
// guide fails CI (the regression guard the plan's U1 called for). Baseline
// captured 2026-07-04 after the TO-#### topic-objective fix: Case 3 is the
// intended fix (0 -> 1); Case 2 (14 -> 17) recovered objectives the same bug
// was truncating; Cases 1/4/5/6/7 are unchanged from before the fix.
const EXPECTED: Record<string, number> = {
  "RMD563_SelfStudyGuide_Case1_DavidTilo.docx": 33,
  "RMD563_SelfStudyGuide_Case2_JessicaDonner.docx": 17,
  "RMD563_SelfStudyGuide_Case3_MarieHernandez.docx": 1,
  "RMD563_SelfStudyGuide_Case4_JohnJackson.docx": 5,
  "RMD563_SelfStudyGuide_Case5_EvelynDixon.docx": 11,
  "RMD563_SelfStudyGuide_Case6_AndrewEdwards.docx": 3,
  "RMD563_SelfStudyGuide_Case7_GloriaLopez.docx": 2,
};

const CURRICULUM = path.join(process.cwd(), "data/curriculum");
const corpusPresent = fs.existsSync(
  path.join(CURRICULUM, "RMD563_SelfStudyGuide_Case1_DavidTilo.docx"),
);

// Skips when the curriculum binaries aren't checked out (e.g. a clean CI clone).
describe.skipIf(!corpusPresent)(
  "objective-extractor corpus characterization",
  () => {
    for (const [file, count] of Object.entries(EXPECTED)) {
      it(`${file.replace("RMD563_SelfStudyGuide_", "")} extracts ${count} objectives`, async () => {
        const parsed = await parseDocument(path.join(CURRICULUM, file));
        expect(extractObjectivesFromText(parsed.text).length).toBe(count);
      });
    }
  },
);
