import "./load-env";
import { neon } from "@neondatabase/serverless";

function directUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return url.replace("-pooler.", ".");
}

const DDL = [
  "CREATE EXTENSION IF NOT EXISTS vector",
  `CREATE TABLE IF NOT EXISTS courses (
    id serial PRIMARY KEY,
    code varchar(20) NOT NULL,
    title text NOT NULL,
    director text,
    created_at timestamptz DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS documents (
    id serial PRIMARY KEY,
    course_id integer REFERENCES courses(id),
    filename text NOT NULL,
    file_type varchar(10),
    case_number integer,
    case_title text,
    diagnosis text,
    source_path text,
    uploaded_at timestamptz DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS chunks (
    id serial PRIMARY KEY,
    document_id integer REFERENCES documents(id),
    chunk_index integer,
    section text,
    content text NOT NULL,
    embedding vector(1536),
    created_at timestamptz DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS aamc_competencies (
    id serial PRIMARY KEY,
    domain varchar(10),
    domain_name text,
    sub_id varchar(20),
    description text,
    stable_id varchar(80),
    full_text text,
    parent_stable_id varchar(80),
    source_doc varchar(120),
    source_page integer,
    embedding vector(1536)
  )`,
  `CREATE TABLE IF NOT EXISTS aamc_keywords (
    id serial PRIMARY KEY,
    keyword_id varchar(10) NOT NULL,
    keyword text NOT NULL,
    definition text,
    synonyms text,
    stable_id varchar(80),
    embedding vector(1536)
  )`,
  `CREATE TABLE IF NOT EXISTS usmle_domains (
    id serial PRIMARY KEY,
    step varchar(10),
    category text,
    domain text,
    subdomain text,
    stable_id varchar(120),
    full_text text,
    parent_stable_id varchar(120),
    source_doc varchar(120),
    source_page integer,
    embedding vector(1536)
  )`,
  `CREATE TABLE IF NOT EXISTS alignments (
    id serial PRIMARY KEY,
    chunk_id integer REFERENCES chunks(id),
    framework varchar(20),
    framework_id text,
    framework_label text,
    confidence numeric(3, 2),
    rationale text,
    status varchar(20) DEFAULT 'pending',
    created_at timestamptz DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS gap_summary (
    id serial PRIMARY KEY,
    document_id integer REFERENCES documents(id),
    framework varchar(20),
    framework_id text,
    framework_label text,
    coverage_status varchar(20),
    chunk_count integer DEFAULT 0,
    avg_confidence numeric(3, 2),
    updated_at timestamptz DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS keyword_tags (
    id serial PRIMARY KEY,
    chunk_id integer REFERENCES chunks(id),
    keyword text,
    category text
  )`,
  `CREATE TABLE IF NOT EXISTS processing_jobs (
    id serial PRIMARY KEY,
    document_id integer REFERENCES documents(id),
    stage varchar(30) NOT NULL,
    progress integer DEFAULT 0,
    message text,
    status varchar(20) DEFAULT 'queued',
    updated_at timestamptz DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS course_objectives (
    id serial PRIMARY KEY,
    document_id integer REFERENCES documents(id),
    ordinal integer,
    text text NOT NULL,
    section_heading text,
    eo_code varchar(20),
    extraction_method varchar(20),
    confidence varchar(10),
    source_excerpt text,
    created_at timestamptz DEFAULT now()
  )`,
];

async function main() {
  const sql = neon(directUrl());
  for (const statement of DDL) {
    await sql(statement);
  }
  console.log("Schema ready (pgvector + RushMap tables).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
