import "./load-env";
import fs from "fs/promises";
import path from "path";
import { execSync } from "child_process";
import { parseAllFrameworkSources } from "../lib/framework-parsers";

const FRAMEWORKS_DIR = path.join(process.cwd(), "data/frameworks");
const PARSED_DIR = path.join(FRAMEWORKS_DIR, "parsed");
const CURRICULUM_DIR = path.join(process.cwd(), "data/curriculum");
const F2F = "2026 Curriculum Inventory Project F2F materials";

const CURRICULUM_MAPPING = [
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
];

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value || value.includes("your-") || value.includes("ep-xxx")) {
    throw new Error(`Missing or placeholder ${name} in .env.local`);
  }
  return value;
}

function hasAzure(): boolean {
  return Boolean(
    process.env.AZURE_OPENAI_ENDPOINT?.trim() &&
      process.env.AZURE_OPENAI_API_KEY?.trim() &&
      !process.env.AZURE_OPENAI_API_KEY.includes("your-key") &&
      process.env.AZURE_OPENAI_DEPLOYMENT_CHAT?.trim() &&
      process.env.AZURE_OPENAI_DEPLOYMENT_EMBED?.trim(),
  );
}

function run(cmd: string) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { stdio: "inherit", cwd: process.cwd(), env: process.env });
}

async function copyCurriculumFiles() {
  await fs.mkdir(CURRICULUM_DIR, { recursive: true });
  let copied = 0;
  for (const { source, dest } of CURRICULUM_MAPPING) {
    const srcPath = path.join(process.cwd(), source);
    const destPath = path.join(CURRICULUM_DIR, dest);
    try {
      await fs.copyFile(srcPath, destPath);
      console.log(`Copied curriculum ${dest}`);
      copied++;
    } catch {
      console.warn(`Skip curriculum copy (missing): ${source}`);
    }
  }
  return copied;
}

async function parseFrameworkArtifacts() {
  const bundle = await parseAllFrameworkSources(FRAMEWORKS_DIR);
  await fs.mkdir(PARSED_DIR, { recursive: true });
  await fs.writeFile(
    path.join(PARSED_DIR, "usmle-2025.json"),
    JSON.stringify(bundle.usmle, null, 2),
  );
  await fs.writeFile(
    path.join(PARSED_DIR, "aamc-keywords.json"),
    JSON.stringify(bundle.aamcKeywords, null, 2),
  );
  await fs.writeFile(
    path.join(PARSED_DIR, "aamc-competencies.json"),
    JSON.stringify(bundle.aamcCompetencies, null, 2),
  );
  console.log(
    `Parsed ${bundle.usmle.length} USMLE, ${bundle.aamcCompetencies.length} AAMC competencies, ${bundle.aamcKeywords.length} keywords`,
  );
}

async function runDbSteps() {
  requireEnv("DATABASE_URL");
  run("npm run db:push");

  if (hasAzure()) {
    run("npm run db:seed-frameworks");
  } else {
    console.warn("\nAzure not configured — seeding frameworks without embeddings.");
    run("npm run db:seed-frameworks -- --skip-embeddings");
  }

  run("npm run db:seed");

  if (hasAzure()) {
    run("npm run db:process");
  } else {
    console.warn(
      "\nSkipping db:process (needs Azure for embeddings + alignment).",
    );
    console.warn("Add Azure vars to .env.local, then run: npm run db:process");
  }
}

async function main() {
  const mode = process.argv[2] ?? "all";

  if (mode === "files" || mode === "all") {
    console.log("=== Copy framework authority files ===");
    run("npm run copy:frameworks");

    console.log("\n=== Copy curriculum faculty guides ===");
    const curriculumCount = await copyCurriculumFiles();

    console.log("\n=== Parse frameworks to JSON ===");
    await parseFrameworkArtifacts();

    console.log(
      `\nFiles ready: frameworks in data/frameworks/, ${curriculumCount} curriculum guides in data/curriculum/`,
    );
  }

  if (mode === "db" || mode === "all") {
    if (!process.env.DATABASE_URL) {
      console.error(
        "\nDATABASE_URL not set. Copy .env.local.example → .env.local and add Neon + Azure credentials.",
      );
      process.exit(1);
    }
    console.log("\n=== Database bootstrap ===");
    await runDbSteps();
    console.log("\nSetup complete.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
