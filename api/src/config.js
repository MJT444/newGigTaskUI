// Loads api/.env (if present) and exposes typed configuration.
// process.loadEnvFile is built into Node >= 20.12; no dotenv dependency needed.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(here, "..", ".env");

if (existsSync(envPath) && typeof process.loadEnvFile === "function") {
  process.loadEnvFile(envPath);
}

export const REPO_ROOT = path.resolve(here, "..", "..");

console.log(`Loaded environment variables from ${envPath}`, process.env.PGPORT);

export const config = {
  port: Number(process.env.PORT || 4000),
  pg: {
    host: process.env.PGHOST || "localhost",
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE || "gigtask",
    user: process.env.PGUSER || "postgres",
    password: process.env.PGPASSWORD || "gigtask",
  },
  mongo: {
    uri: process.env.MONGO_URI || "mongodb://localhost:27018/",
    dbName: process.env.MONGO_DB || "gigtask",
  },
};
