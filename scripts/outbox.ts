/**
 * List emails the console transport "sent" (written to ./data/<mode>/outbox).
 *   npm run outbox            → newest 10 (live)
 *   npm run outbox -- --demo  → demo outbox
 *   npm run outbox -- --all   → every message
 */
import fs from "node:fs";
import path from "node:path";

const mode = process.argv.includes("--demo") ? "demo" : "live";
const dir = path.join(process.cwd(), process.env.APP_DATA_DIR || `data/${mode}`, "outbox");
if (!fs.existsSync(dir)) {
  console.log(`No outbox yet at ${dir}.`);
  process.exit(0);
}
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort().reverse();
const shown = process.argv.includes("--all") ? files : files.slice(0, 10);
for (const f of shown) {
  const m = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  console.log(`\n── ${f}\nTo: ${m.to}\nSubject: ${m.subject}\n\n${(m.text ?? "").slice(0, 1200)}`);
}
console.log(`\n${shown.length} of ${files.length} message(s) from ${dir}`);
