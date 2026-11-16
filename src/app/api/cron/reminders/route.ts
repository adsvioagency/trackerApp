import { env } from "@/lib/env";
import { runRemindersForAllUsers } from "@/lib/reminders";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Server-side reminder schedule. Call once a day (or more often; repeats are
 * gated by the per-item interval and the daily dedupe key).
 *   Authorization: Bearer <CRON_SECRET>   (Vercel Cron sends this automatically)
 */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const secret = env.cronSecret;
  const url = new URL(req.url);
  const provided = auth.startsWith("Bearer ") ? auth.slice(7) : url.searchParams.get("secret") ?? "";
  if (!secret || provided !== secret) return new Response("Unauthorized", { status: 401 });
  const dryRun = url.searchParams.get("dry") === "1";
  const results = await runRemindersForAllUsers({ dryRun });
  return Response.json({ ok: true, ranAt: new Date().toISOString(), delivery: env.remindersDelivery ? "email" : "in_app_only", results: results.map((r) => ({ userId: r.userId, eligible: r.eligible, sent: r.sent, skipped: r.skipped })) });
}
