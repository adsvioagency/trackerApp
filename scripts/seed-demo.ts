/**
 * Fill the isolated demo environment (APP_MODE=demo, ./data/demo) with fictional data.
 *   npm run demo:seed             → seeds once (no-op if demo data exists)
 *   npm run demo:seed -- --reset  → wipes the demo owner and seeds again
 * Stop `npm run demo` first when using the embedded database.
 */
import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });

async function main() {
  process.env.APP_MODE = "demo";
  const { seedDemoData } = await import("../src/lib/demo-seed");
  const { closeDb } = await import("../src/db");
  const r = await seedDemoData({ reset: process.argv.includes("--reset") });
  console.log(r.seeded ? "Demo data created for demo@example.com." : "Demo data already exists. Use --reset to start over.");
  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
