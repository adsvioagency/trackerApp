/**
 * Database client.
 *
 * - With DATABASE_URL: Postgres (Supabase, Neon, local Postgres) via postgres.js.
 * - Without it: embedded Postgres (PGlite) stored under ./data so the app runs
 *   locally with zero credentials. Migrations are applied automatically at boot.
 *
 * The same Drizzle schema and SQL migrations are used in both cases.
 */
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { drizzle as drizzlePg, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

export type Db = PgliteDatabase<typeof schema> | PostgresJsDatabase<typeof schema>;

type Cache = { db?: Db; ready?: Promise<Db>; closer?: () => Promise<void> };
const globalCache = globalThis as unknown as { __pa_db?: Cache };
const cache: Cache = (globalCache.__pa_db ??= {});

async function openPglite(): Promise<Db> {
  const { openEmbeddedDatabase } = await import("@/db/embedded");
  const { db, close } = await openEmbeddedDatabase();
  cache.closer = close;
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
    const url = process.env.DATABASE_URL || process.env.NETLIFY_DB_URL;
    if (!url && (process.env.NETLIFY === "true" || process.env.VERCEL === "1")) {
      throw new Error("A persistent Postgres database is required for hosted tracker sessions and records.");
    }
    cache.ready = (url ? openPostgres(url) : openPglite()).then((db) => {
      cache.db = db;
      return db;
    }).catch((error: unknown) => {
      cache.ready = undefined;
      throw error;
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
