import path from "node:path";
import fs from "node:fs";
import * as schema from "./schema";

const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

function dataDir(): string {
  const mode = process.env.APP_MODE === "demo" ? "demo" : "live";
  const dir = process.env.APP_DATA_DIR || path.join("data", mode);
  // The embedded database is local runtime state, never a deployment asset.
  return path.isAbsolute(dir) ? dir : path.join(/* turbopackIgnore: true */ process.cwd(), dir);
}

export async function openEmbeddedDatabase() {
  const { drizzle: drizzlePglite } = await import("drizzle-orm/pglite");
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
  return { db, close: () => client.close() };
}
