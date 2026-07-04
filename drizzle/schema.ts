import {
  pgTable,
  serial,
  varchar,
  text,
  integer,
  timestamp,
  decimal,
  customType,
  index,
  primaryKey,
  boolean,
} from "drizzle-orm/pg-core";

const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return "vector(1536)";
  },
  toDriver(value: number[]) {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: string) {
    return value
      .slice(1, -1)
      .split(",")
      .map((v) => parseFloat(v));
  },
});

export const courses = pgTable("courses", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 20 }).notNull(),
  title: text("title").notNull(),
  director: text("director"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  courseId: integer("course_id").references(() => courses.id),
  filename: text("filename").notNull(),
  fileType: varchar("file_type", { length: 10 }),
  caseNumber: integer("case_number"),
  caseTitle: text("case_title"),
  diagnosis: text("diagnosis"),
  sourcePath: text("source_path"),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).defaultNow(),
});

export const chunks = pgTable("chunks", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").references(() => documents.id),
  chunkIndex: integer("chunk_index"),
  section: text("section"),
  content: text("content").notNull(),
  embedding: vector("embedding"),
  // Set when the alignment stage processes a chunk, whether or not it produced
  // alignment rows. Distinguishes "not yet aligned" from "aligned to nothing"
  // for resume and completeness — see lib/pipeline.ts alignment loop.
  alignedAt: timestamp("aligned_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const aamcCompetencies = pgTable("aamc_competencies", {
  id: serial("id").primaryKey(),
  domain: varchar("domain", { length: 10 }),
  domainName: text("domain_name"),
  subId: varchar("sub_id", { length: 20 }),
  description: text("description"),
  stableId: varchar("stable_id", { length: 80 }),
  fullText: text("full_text"),
  parentStableId: varchar("parent_stable_id", { length: 80 }),
  sourceDoc: varchar("source_doc", { length: 120 }),
  sourcePage: integer("source_page"),
  embedding: vector("embedding"),
});

export const aamcKeywords = pgTable("aamc_keywords", {
  id: serial("id").primaryKey(),
  keywordId: varchar("keyword_id", { length: 10 }).notNull(),
  keyword: text("keyword").notNull(),
  definition: text("definition"),
  synonyms: text("synonyms"),
  stableId: varchar("stable_id", { length: 80 }),
  embedding: vector("embedding"),
});

export const usmleDomains = pgTable("usmle_domains", {
  id: serial("id").primaryKey(),
  step: varchar("step", { length: 10 }),
  category: text("category"),
  domain: text("domain"),
  subdomain: text("subdomain"),
  stableId: varchar("stable_id", { length: 120 }),
  fullText: text("full_text"),
  parentStableId: varchar("parent_stable_id", { length: 120 }),
  sourceDoc: varchar("source_doc", { length: 120 }),
  sourcePage: integer("source_page"),
  embedding: vector("embedding"),
});

export const alignments = pgTable("alignments", {
  id: serial("id").primaryKey(),
  chunkId: integer("chunk_id").references(() => chunks.id),
  framework: varchar("framework", { length: 20 }),
  frameworkId: text("framework_id"),
  frameworkLabel: text("framework_label"),
  confidence: decimal("confidence", { precision: 3, scale: 2 }),
  rationale: text("rationale"),
  status: varchar("status", { length: 20 }).default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const gapSummary = pgTable("gap_summary", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").references(() => documents.id),
  framework: varchar("framework", { length: 20 }),
  frameworkId: text("framework_id"),
  frameworkLabel: text("framework_label"),
  coverageStatus: varchar("coverage_status", { length: 20 }),
  chunkCount: integer("chunk_count").default(0),
  avgConfidence: decimal("avg_confidence", { precision: 3, scale: 2 }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const keywordTags = pgTable(
  "keyword_tags",
  {
    id: serial("id").primaryKey(),
    chunkId: integer("chunk_id").references(() => chunks.id),
    keyword: text("keyword"),
    category: text("category"),
  },
  (table) => ({
    // getMapData filters/joins keyword tags by chunk; index the FK so it scales.
    chunkIdIdx: index("keyword_tags_chunk_id_idx").on(table.chunkId),
  }),
);

export const processingJobs = pgTable("processing_jobs", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").references(() => documents.id),
  stage: varchar("stage", { length: 30 }).notNull(),
  progress: integer("progress").default(0),
  message: text("message"),
  status: varchar("status", { length: 20 }).default("queued"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const courseObjectives = pgTable("course_objectives", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").references(() => documents.id),
  ordinal: integer("ordinal"),
  text: text("text").notNull(),
  sectionHeading: text("section_heading"),
  eoCode: varchar("eo_code", { length: 20 }),
  extractionMethod: varchar("extraction_method", { length: 20 }),
  confidence: varchar("confidence", { length: 10 }),
  sourceExcerpt: text("source_excerpt"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const mediaAssets = pgTable("media_assets", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id")
    .references(() => documents.id)
    .notNull(),
  type: varchar("type", { length: 20 }).notNull(),
  label: text("label").notNull(),
  section: text("section"),
  referenceKind: varchar("reference_kind", { length: 30 }).notNull(),
  hasCaptionInText: boolean("has_caption_in_text").default(false),
  textForEmbed: text("text_for_embed"),
  storagePath: text("storage_path"),
  sourceIndex: integer("source_index"),
  extractionScope: varchar("extraction_scope", { length: 20 }),
  videoUrl: text("video_url"),
  captionSource: varchar("caption_source", { length: 10 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const figureCaptions = pgTable("figure_captions", {
  id: serial("id").primaryKey(),
  filename: text("filename").notNull(),
  label: text("label").notNull(),
  textForEmbed: text("text_for_embed").notNull(),
  sourceIndex: integer("source_index"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const chunkMedia = pgTable(
  "chunk_media",
  {
    chunkId: integer("chunk_id")
      .references(() => chunks.id)
      .notNull(),
    mediaAssetId: integer("media_asset_id")
      .references(() => mediaAssets.id)
      .notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.chunkId, table.mediaAssetId] }),
    chunkIdIdx: index("chunk_media_chunk_id_idx").on(table.chunkId),
    mediaAssetIdIdx: index("chunk_media_media_asset_id_idx").on(table.mediaAssetId),
  }),
);

export type Course = typeof courses.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type Chunk = typeof chunks.$inferSelect;
export type Alignment = typeof alignments.$inferSelect;
export type ProcessingJob = typeof processingJobs.$inferSelect;
export type CourseObjective = typeof courseObjectives.$inferSelect;
export type MediaAsset = typeof mediaAssets.$inferSelect;
export type ChunkMedia = typeof chunkMedia.$inferSelect;
export type FigureCaption = typeof figureCaptions.$inferSelect;
