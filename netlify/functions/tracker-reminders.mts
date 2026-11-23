export const config = { schedule: "0 12 * * *" };

export default async function trackerReminders() {
  const { APP_URL, CRON_SECRET, CONTEXT } = process.env;
  if (CONTEXT && CONTEXT !== "production") return new Response(null, { status: 204 });
  if (!APP_URL || !CRON_SECRET) return new Response(null, { status: 204 });

  const response = await fetch(new URL("/api/cron/reminders", APP_URL), {
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
    redirect: "error",
  });
  if (!response.ok) throw new Error(`Tracker reminders returned HTTP ${response.status}`);
  return new Response(null, { status: 204 });
}
