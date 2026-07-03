import "./load-env";
import fs from "fs/promises";
import path from "path";
import { execSync } from "child_process";
import { parseAllFrameworkSources } from "../lib/framework-parsers";
import { copyCurriculumFiles } from "./curriculum-sources";

const FRAMEWORKS_DIR = path.join(process.cwd(), "data/frameworks");
const PARSED_DIR = path.join(FRAMEWORKS_DIR, "parsed");

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

async function copyCurriculumFilesForSetup() {
  return copyCurriculumFiles({ includeSelfStudy: false });
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
    const curriculumCount = await copyCurriculumFilesForSetup();

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
