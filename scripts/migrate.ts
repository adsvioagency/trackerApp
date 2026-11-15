/**
 * Apply SQL migrations in ./drizzle to the configured database.
 *   npm run db:migrate
 * With DATABASE_URL set, migrates that Postgres. Without it, migrates the
 * embedded database under ./data (the app also does this at boot).
 */
import "dotenv/config";
import path from "node:path";

async function main() {
  const folder = path.join(process.cwd(), "drizzle");
  const url = process.env.DATABASE_URL;
  if (url) {
    const postgres = (await import("postgres")).default;
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    const client = postgres(url, { prepare: false, max: 1 });
    const db = drizzle(client);
    await migrate(db, { migrationsFolder: folder });
    await client.end();
    console.log("Migrated Postgres at", url.replace(/:\/\/.*@/, "://***@"));
  } else {
    const { getDb, closeDb } = await import("../src/db");
    await getDb();
    await closeDb();
    console.log("Migrated embedded database (PGlite).");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
