import fs from "fs/promises";
import path from "path";
import mammoth from "mammoth";

export type ParsedDocument = {
  text: string;
  fileType: "pdf" | "docx" | "pptx";
};

export async function parseDocument(
  filePath: string,
  buffer?: Buffer,
): Promise<ParsedDocument> {
  const ext = path.extname(filePath).toLowerCase();
  const data = buffer ?? (await fs.readFile(filePath));

  if (ext === ".pdf") {
    const pdfParse = (await import("pdf-parse")).default;
    const parsed = await pdfParse(data);
    return { text: parsed.text, fileType: "pdf" };
  }

  if (ext === ".docx") {
    const result = await mammoth.extractRawText({ buffer: data });
    return { text: result.value, fileType: "docx" };
  }

  if (ext === ".pptx") {
    const { parseOfficeAsync } = await import("officeparser");
    const text = await parseOfficeAsync(data);
    return { text: String(text), fileType: "pptx" };
  }

  throw new Error(`Unsupported file type: ${ext}`);
}

export const ALLOWED_EXTENSIONS = [".pdf", ".docx", ".pptx"];
export const MAX_FILE_BYTES = 50 * 1024 * 1024;
