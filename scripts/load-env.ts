import fs from "fs";
import path from "path";
import { config } from "dotenv";

const root = process.cwd();

for (const file of [".env.local", ".env"]) {
  const full = path.join(root, file);
  if (fs.existsSync(full)) {
    config({ path: full, override: false });
  }
}
