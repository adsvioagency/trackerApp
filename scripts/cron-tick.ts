/**
 * Run the reminder schedule once from the command line (for local use or an
 * external scheduler such as Windows Task Scheduler or cron):
 *   npm run cron:tick            → sends what is due (respects settings)
 *   npm run cron:tick -- --dry   → preview only
 */
import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });

async function main() {
  const dryRun = process.argv.includes("--dry");
  const { runRemindersForAllUsers } = await import("../src/lib/reminders");
  const { closeDb } = await import("../src/db");
  const results = await runRemindersForAllUsers({ dryRun });
  for (const r of results) console.log(`${r.userId}: eligible ${r.eligible}, sent ${r.sent}${r.skipped ? ` (${r.skipped})` : ""}`);
  if (dryRun) for (const r of results) for (const it of r.items) console.log(`  - [${it.group}] ${it.title} · ${it.detail}`);
  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
