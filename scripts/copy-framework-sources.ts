import fs from "fs/promises";
import path from "path";

const SOURCE_DIR = path.join(process.cwd(), "Curriculum Map - AI project");
const DEST_DIR = path.join(process.cwd(), "data/frameworks");

const MAPPING = [
  {
    source: "USMLE_Content_Outline_0 (1).pdf",
    dest: "usmle-content-outline-2025.pdf",
  },
  {
    source: "meded-curriculum-keywords-083024.xlsx",
    dest: "aamc-curriculum-keywords-083024.xlsx",
  },
  {
    source: "meded-curriculum-inventory-guidebook-to-building-map_0.pdf",
    dest: "aamc-curriculum-inventory-guidebook.pdf",
  },
];

async function main() {
  await fs.mkdir(DEST_DIR, { recursive: true });
  let copied = 0;
  for (const { source, dest } of MAPPING) {
    const srcPath = path.join(SOURCE_DIR, source);
    const destPath = path.join(DEST_DIR, dest);
    try {
      await fs.copyFile(srcPath, destPath);
      console.log(`Copied ${dest}`);
      copied++;
    } catch {
      console.warn(`Skip copy (missing): ${srcPath}`);
    }
  }
  if (copied === 0) {
    console.warn(
      "No framework sources copied. Place files in data/frameworks/ manually or add Curriculum Map - AI project/ at repo root.",
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
