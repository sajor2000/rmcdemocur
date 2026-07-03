import type { Config } from "drizzle-kit";
import { config } from "dotenv";
import fs from "fs";
import path from "path";

for (const file of [".env.local", ".env"]) {
  const full = path.join(process.cwd(), file);
  if (fs.existsSync(full)) config({ path: full, override: false });
}

/** Neon pooler endpoints can lack extension types for DDL; use direct host for push. */
function migrationConnectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return url.replace("-pooler.", ".");
}

export default {
  schema: "./drizzle/schema.ts",
  out: "./drizzle/migrations",
  driver: "pg",
  dbCredentials: {
    connectionString: migrationConnectionString(),
  },
} satisfies Config;
