export const MEDIA_ASSET_TYPES = ["figure", "video"] as const;
export type MediaAssetType = (typeof MEDIA_ASSET_TYPES)[number];

export const REFERENCE_KINDS = [
  "answer_image",
  "figure",
  "provided_image",
  "inline_ref",
  "video",
] as const;
export type ReferenceKind = (typeof REFERENCE_KINDS)[number];

export const EXTRACTION_SCOPES = ["faculty", "self_study", "pdf_pending"] as const;
export type ExtractionScope = (typeof EXTRACTION_SCOPES)[number];

export type DocumentFigureMeta = {
  filename: string;
  caseNumber: number;
  fileType: "pdf" | "docx" | "pptx";
  guideKind: "faculty" | "self_study";
};

export type FigureRegistryEntry = {
  label: string;
  referenceKind: ReferenceKind;
  section: string | null;
  lineIndex: number;
  hasCaptionInText: boolean;
  textForEmbed: string | null;
  extractionScope: ExtractionScope;
  sourceIndex: number | null;
  type: MediaAssetType;
  videoUrl?: string | null;
};

export function inferGuideKind(filename: string): "faculty" | "self_study" {
  return filename.includes("FacultyGuide") ? "faculty" : "self_study";
}

export function inferExtractionScope(meta: DocumentFigureMeta): ExtractionScope {
  if (meta.fileType === "pdf" && meta.guideKind === "faculty") return "pdf_pending";
  if (meta.guideKind === "faculty" && meta.fileType === "docx") return "faculty";
  return "self_study";
}

export function assertMediaAssetType(value: string): MediaAssetType {
  if (!(MEDIA_ASSET_TYPES as readonly string[]).includes(value)) {
    throw new Error(`Invalid media asset type: ${value}`);
  }
  return value as MediaAssetType;
}

export function assertReferenceKind(value: string): ReferenceKind {
  if (!(REFERENCE_KINDS as readonly string[]).includes(value)) {
    throw new Error(`Invalid reference kind: ${value}`);
  }
  return value as ReferenceKind;
}
