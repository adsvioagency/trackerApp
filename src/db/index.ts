/**
 * Database client.
 *
 * - With DATABASE_URL: Postgres (Supabase, Neon, local Postgres) via postgres.js.
 * - Without it: embedded Postgres (PGlite) stored under ./data so the app runs
 *   locally with zero credentials. Migrations are applied automatically at boot.
 *
 * The same Drizzle schema and SQL migrations are used in both cases.
 */
import path from "node:path";
import fs from "node:fs";
import { drizzle as drizzlePglite, type PgliteDatabase } from "drizzle-orm/pglite";
import { drizzle as drizzlePg, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

export type Db = PgliteDatabase<typeof schema> | PostgresJsDatabase<typeof schema>;

type Cache = { db?: Db; ready?: Promise<Db>; closer?: () => Promise<void> };
const globalCache = globalThis as unknown as { __pa_db?: Cache };
const cache: Cache = (globalCache.__pa_db ??= {});

const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

function dataDir(): string {
  const mode = process.env.APP_MODE === "demo" ? "demo" : "live";
  const dir = process.env.APP_DATA_DIR || path.join("data", mode);
  return path.isAbsolute(dir) ? dir : path.join(process.cwd(), dir);
}

async function openPglite(): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  let client: InstanceType<typeof PGlite>;
  if (process.env.PGLITE_MEMORY === "1") {
    client = new PGlite();
  } else {
    const dir = path.join(dataDir(), "pglite");
    fs.mkdirSync(dir, { recursive: true });
    client = new PGlite(dir);
  }
  const db = drizzlePglite(client, { schema });
  if (fs.existsSync(MIGRATIONS_FOLDER)) {
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  }
  cache.closer = () => client.close();
  return db;
}

async function openPostgres(url: string): Promise<Db> {
  const postgres = (await import("postgres")).default;
  // prepare:false keeps us compatible with transaction-mode poolers (Supabase 6543).
  const client = postgres(url, { prepare: false, max: 5 });
  const db = drizzlePg(client, { schema });
  cache.closer = () => client.end();
  return db;
}

/** Returns the shared database instance, opening it on first use. */
export async function getDb(): Promise<Db> {
  if (cache.db) return cache.db;
  if (!cache.ready) {
    const url = process.env.DATABASE_URL;
    cache.ready = (url ? openPostgres(url) : openPglite()).then((db) => {
      cache.db = db;
      return db;
    });
  }
  return cache.ready;
}

/** For tests and scripts: close and forget the current connection. */
export async function closeDb() {
  if (cache.closer) await cache.closer();
  cache.db = undefined;
  cache.ready = undefined;
  cache.closer = undefined;
}

export { schema };
