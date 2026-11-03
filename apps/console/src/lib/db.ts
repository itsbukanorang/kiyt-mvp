import { Pool } from "pg";

const globalForKiYT =
  globalThis as unknown as {
    kiytDatabase?: Pool;
  };

/*
 * pg connects lazily.
 *
 * During `next build`, DATABASE_URL is intentionally
 * not injected into the image build.
 *
 * The live container receives DATABASE_URL from
 * server-side environment configuration.
 */
export const db =
  globalForKiYT.kiytDatabase ??
  new Pool({
    connectionString:
      process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

if (
  process.env.NODE_ENV !==
  "production"
) {
  globalForKiYT.kiytDatabase =
    db;
}
