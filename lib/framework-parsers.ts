import fs from "fs/promises";
import { readFileSync } from "fs";
import path from "path";
import pdf from "pdf-parse";
import * as XLSX from "xlsx";

export type ParsedUsmleRow = {
  stableId: string;
  step: string;
  category: string;
  domain: string;
  subdomain: string | null;
  fullText: string;
  parentStableId: string | null;
  sourceDoc: string;
};

export type ParsedAamcKeywordRow = {
  keywordId: string;
  keyword: string;
  definition: string;
  synonyms: string | null;
  stableId: string;
};

export type ParsedAamcCompetencyRow = {
  domain: string;
  domainName: string;
  subId: string;
  description: string;
  stableId: string;
  fullText: string;
  parentStableId: string | null;
  sourceDoc: string;
};

const USMLE_SYSTEMS = [
  "Human Development",
  "Immune System",
  "Blood & Lymphoreticular System",
  "Behavioral Health",
  "Nervous System & Special Senses",
  "Skin & Subcutaneous Tissue",
  "Musculoskeletal System",
  "Cardiovascular System",
  "Respiratory System",
  "Gastrointestinal System",
  "Renal & Urinary System",
  "Pregnancy, Childbirth, & the Puerperium",
  "Female and Transgender Reproductive System & Breast",
  "Male and Transgender Reproductive System",
  "Endocrine System",
  "Multisystem Processes & Disorders",
  "Biostatistics, Epidemiology/Population Health, & Interpretation of the Medical Literature",
  "Social Sciences",
] as const;

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

const USMLE_STABLE_ID_MAX = 120;

/** Child stable IDs must fit usmle_domains.stable_id varchar(120). */
export function buildUsmleChildStableId(
  parentStableId: string,
  subdomain: string,
): string {
  const maxSlugLen = Math.max(16, USMLE_STABLE_ID_MAX - parentStableId.length - 1);
  return `${parentStableId}:${slugify(subdomain).slice(0, maxSlugLen)}`;
}

function isBulletLine(line: string): boolean {
  const t = line.trim();
  return /^[•o▪]/.test(t) || /^\d+\s*$/.test(t);
}

function isNoiseLine(line: string): boolean {
  const t = line.trim();
  if (!t) return true;
  if (t === "Public") return true;
  if (/^For Public Release/i.test(t)) return true;
  if (/^Copyright ©/i.test(t)) return true;
  if (/^USMLE Content Outline/i.test(t)) return true;
  if (/^\d+$/.test(t)) return true;
  return false;
}

const USMLE_SYSTEM_SET = new Set<string>(USMLE_SYSTEMS);

function isUsmleSystemHeader(line: string): boolean {
  return USMLE_SYSTEM_SET.has(line.trim());
}

/** True when lines after a system header contain real outline content, not another TOC header. */
function hasSubstantiveFollow(lines: string[], headerIdx: number): boolean {
  const window = lines.slice(headerIdx + 1, headerIdx + 12);
  for (const line of window) {
    if (isUsmleSystemHeader(line)) return false;
    if (isBulletLine(line)) return true;
    if (line.length > 0 && line.length < 160 && !line.includes("©")) return true;
    if (line.length >= 160) return true;
  }
  return false;
}

function findUsmleContentStart(lines: string[]): number {
  for (let i = 0; i < lines.length; i++) {
    if (isUsmleSystemHeader(lines[i]) && hasSubstantiveFollow(lines, i)) {
      return i;
    }
  }
  return 0;
}

function isSubsectionHeader(line: string): boolean {
  return (
    line.length > 0 &&
    line.length < 160 &&
    !line.includes("©") &&
    !isUsmleSystemHeader(line) &&
    !isBulletLine(line)
  );
}

export function parseUsmleOutlineText(
  text: string,
  sourceDoc = "usmle-content-outline-2025.pdf",
): ParsedUsmleRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => !isNoiseLine(l));

  const contentStart = findUsmleContentStart(lines);
  const contentLines = lines.slice(contentStart);
  const rows: ParsedUsmleRow[] = [];

  let currentSystem: string | null = null;
  let currentSub: string | null = null;
  let subBuffer: string[] = [];
  let systemLines: string[] = [];

  const systemStableId = (name: string) => `usmle:${slugify(name)}`;

  const flushSub = () => {
    if (!currentSystem || !currentSub) return;
    const parentId = systemStableId(currentSystem);
    rows.push({
      stableId: buildUsmleChildStableId(parentId, currentSub),
      step: "Both",
      category: "Organ Systems",
      domain: currentSystem,
      subdomain: currentSub,
      fullText: subBuffer.join(" ").slice(0, 4000),
      parentStableId: parentId,
      sourceDoc,
    });
    subBuffer = [];
    currentSub = null;
  };

  const flushSystem = () => {
    flushSub();
    if (!currentSystem) return;
    const stableId = systemStableId(currentSystem);
    const sectionText = systemLines.join("\n").trim();
    const existing = rows.find(
      (r) => r.stableId === stableId && r.parentStableId === null,
    );
    if (existing) {
      existing.fullText = sectionText.slice(0, 4000);
    } else {
      rows.push({
        stableId,
        step: "Both",
        category: "Organ Systems",
        domain: currentSystem,
        subdomain: null,
        fullText: sectionText.slice(0, 4000),
        parentStableId: null,
        sourceDoc,
      });
    }
    systemLines = [];
    currentSystem = null;
  };

  for (const line of contentLines) {
    if (isUsmleSystemHeader(line)) {
      flushSystem();
      currentSystem = line;
      const stableId = systemStableId(line);
      if (!rows.some((r) => r.stableId === stableId && r.parentStableId === null)) {
        rows.push({
          stableId,
          step: "Both",
          category: "Organ Systems",
          domain: line,
          subdomain: null,
          fullText: "",
          parentStableId: null,
          sourceDoc,
        });
      }
      continue;
    }

    if (!currentSystem) continue;

    systemLines.push(line);

    if (isBulletLine(line)) {
      subBuffer.push(line.replace(/^[•o▪]\s*/, ""));
      continue;
    }

    if (isSubsectionHeader(line)) {
      flushSub();
      currentSub = line;
      continue;
    }

    subBuffer.push(line);
  }

  flushSystem();
  return rows;
}

async function parseUsmleOutlinePdf(
  pdfPath: string,
): Promise<ParsedUsmleRow[]> {
  const buffer = await fs.readFile(pdfPath);
  const parsed = await pdf(buffer);
  const sourceDoc = path.basename(pdfPath);
  return parseUsmleOutlineText(parsed.text, sourceDoc);
}

export function parseAamcKeywordsSheet(
  rows: unknown[][],
  sourceDoc = "aamc-curriculum-keywords-083024.xlsx",
): ParsedAamcKeywordRow[] {
  const headerIdx = rows.findIndex(
    (r) => Array.isArray(r) && String(r[0] ?? "").trim() === "ID",
  );
  if (headerIdx < 0) {
    throw new Error(`AAMC keywords header row not found in ${sourceDoc}`);
  }

  const dataRows = rows.slice(headerIdx + 1);
  const result: ParsedAamcKeywordRow[] = [];

  for (const row of dataRows) {
    if (!Array.isArray(row) || !row[0] || !row[1]) continue;
    const keywordId = String(row[0]).trim();
    if (!/^K\d+$/i.test(keywordId)) continue;
    const keyword = String(row[1]).trim();
    result.push({
      keywordId,
      keyword,
      definition: String(row[3] ?? row[2] ?? "").trim(),
      synonyms: row[4] ? String(row[4]).trim() : null,
      stableId: `aamc-kw:${keywordId.toLowerCase()}`,
    });
  }

  return result;
}

async function parseAamcKeywordsXlsx(
  xlsxPath: string,
): Promise<ParsedAamcKeywordRow[]> {
  const wb = XLSX.readFile(xlsxPath);
  const sheet = wb.Sheets["AAMC Curriculum Keywords"];
  if (!sheet) {
    throw new Error(`Sheet "AAMC Curriculum Keywords" not found in ${xlsxPath}`);
  }
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];
  return parseAamcKeywordsSheet(rows, path.basename(xlsxPath));
}

type PcrsSource = {
  meta: { source: string; edition: string };
  domains: {
    code: string;
    name: string;
    description: string;
    competencies: string[];
  }[];
};

type CoreEpaSource = {
  meta: { source: string; edition: string };
  epas: string[];
};

/** Load the official 2013 AAMC PCRS (8 domains / 58 competencies) and the 13
 * Core EPAs from committed authority JSON. Replaces the former hand-written
 * stub catalog. Stable IDs use the aamc:<code><n> convention; EPAs keep
 * aamc:epa<n> so the AAMC_EPA vs AAMC_PCRS classification heuristic still works. */
export function loadAamcPcrsCatalog(frameworksDir: string): ParsedAamcCompetencyRow[] {
  const pcrs = JSON.parse(
    readFileSync(path.join(frameworksDir, "aamc-pcrs-2013.json"), "utf-8"),
  ) as PcrsSource;
  const epaSource = JSON.parse(
    readFileSync(path.join(frameworksDir, "aamc-core-epas.json"), "utf-8"),
  ) as CoreEpaSource;

  const rows: ParsedAamcCompetencyRow[] = [];

  for (const domain of pcrs.domains) {
    const code = domain.code.toLowerCase();
    domain.competencies.forEach((text, i) => {
      const n = i + 1;
      rows.push({
        domain: domain.code,
        domainName: domain.name,
        subId: `${domain.code}${n}`,
        description: text,
        stableId: `aamc:${code}${n}`,
        fullText: `${domain.name} — ${text}`,
        parentStableId: `aamc:${code}`,
        sourceDoc: `aamc-pcrs-${pcrs.meta.edition}`,
      });
    });
  }

  epaSource.epas.forEach((text, i) => {
    const n = i + 1;
    rows.push({
      domain: "EPA",
      domainName: "Core EPA",
      subId: `EPA${n}`,
      description: text,
      stableId: `aamc:epa${n}`,
      fullText: `Core EPA ${n} — ${text}`,
      parentStableId: "aamc:epa",
      sourceDoc: "aamc-core-epas",
    });
  });

  return rows;
}

async function parseAamcGuidebookPdf(
  pdfPath: string,
): Promise<ParsedAamcCompetencyRow[]> {
  // The guidebook PDF is methodological (its PCRS appendix is title-only). The
  // authoritative competency text lives in the committed PCRS/EPA JSON alongside it.
  return loadAamcPcrsCatalog(path.dirname(pdfPath));
}

export type ParsedFrameworkBundle = {
  usmle: ParsedUsmleRow[];
  aamcKeywords: ParsedAamcKeywordRow[];
  aamcCompetencies: ParsedAamcCompetencyRow[];
};

export async function parseAllFrameworkSources(
  frameworksDir: string,
): Promise<ParsedFrameworkBundle> {
  const usmlePath = path.join(frameworksDir, "usmle-content-outline-2025.pdf");
  const xlsxPath = path.join(frameworksDir, "aamc-curriculum-keywords-083024.xlsx");
  const guidePath = path.join(frameworksDir, "aamc-curriculum-inventory-guidebook.pdf");

  const usmle = await parseUsmleOutlinePdf(usmlePath);
  const aamcKeywords = await parseAamcKeywordsXlsx(xlsxPath);
  const aamcCompetencies = await parseAamcGuidebookPdf(guidePath);

  return { usmle, aamcKeywords, aamcCompetencies };
}
