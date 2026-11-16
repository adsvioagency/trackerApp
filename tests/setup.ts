import { beforeAll, afterAll } from "vitest";

process.env.PGLITE_MEMORY = "1";
process.env.APP_MODE = "live";
process.env.APP_SECRET = "test-secret";
process.env.OWNER_EMAILS = "owner@example.com";
process.env.APP_TIMEZONE = "America/Santo_Domingo";
process.env.EMAIL_TRANSPORT = "console";
process.env.REMINDERS_DELIVERY = "off";
process.env.APP_URL = "http://localhost:3000";

beforeAll(async () => {
  const { getDb } = await import("@/db");
  await getDb();
});

afterAll(async () => {
  const { closeDb } = await import("@/db");
  await closeDb();
});
