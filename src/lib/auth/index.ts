/**
 * Email-code sign-in with an owner allowlist and server-side sessions.
 *
 * Flow: request code → 6-digit code emailed (console transport locally) →
 * verify → session cookie (httpOnly, 30 days). Every server action and route
 * resolves the current user from the session and scopes queries by user id.
 */
import "server-only";
import { cookies, headers } from "next/headers";
import { and, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { env } from "@/lib/env";
import { hmac, randomCode, randomToken, sha256 } from "./crypto";
import { getEmailTransport } from "@/lib/email";
import { signInEmail } from "@/lib/email/templates";

export const SESSION_COOKIE = "pa_session";
const SESSION_DAYS = 30;
const CODE_MINUTES = 10;
const MAX_ATTEMPTS = 5;

export type CurrentUser = typeof schema.users.$inferSelect;

export function isAllowedEmail(email: string): boolean {
  return env.ownerEmails.includes(email.trim().toLowerCase());
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

/** Create and email a sign-in code. Returns the code only when dev display is enabled. */
export async function requestSignInCode(rawEmail: string): Promise<{ ok: boolean; devCode?: string; error?: string }> {
  const email = normalizeEmail(rawEmail);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: "Enter a valid email address." };
  // Do not reveal whether an address is on the allowlist: respond the same way.
  if (!isAllowedEmail(email)) return { ok: true };

  const db = await getDb();
  // Throttle: at most 5 codes per 15 minutes per address.
  const recent = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.authCodes)
    .where(and(eq(schema.authCodes.email, email), gt(schema.authCodes.createdAt, new Date(Date.now() - 15 * 60_000))));
  if (Number(recent[0]?.n ?? 0) >= 5) return { ok: false, error: "Too many codes requested. Try again in a few minutes." };

  const code = randomCode();
  await db.insert(schema.authCodes).values({
    email,
    codeHash: hmac(env.appSecret, `${email}:${code}`),
    expiresAt: new Date(Date.now() + CODE_MINUTES * 60_000),
  });
  const transport = getEmailTransport();
  const tpl = signInEmail({ code, minutes: CODE_MINUTES, appUrl: env.appUrl });
  const result = await transport.send({ to: email, subject: tpl.subject, text: tpl.text, html: tpl.html });
  if (!result.ok) return { ok: false, error: `Could not send the email (${result.error}).` };
  return { ok: true, devCode: env.showDevCode && transport.name === "console" ? code : undefined };
}

/** Verify a code, create the user if needed, and set the session cookie. */
export async function verifySignInCode(rawEmail: string, rawCode: string): Promise<{ ok: boolean; error?: string }> {
  const email = normalizeEmail(rawEmail);
  const code = rawCode.replace(/\D/g, "");
  if (!isAllowedEmail(email)) return { ok: false, error: "That code is not valid." };
  const db = await getDb();
  const candidates = await db
    .select()
    .from(schema.authCodes)
    .where(and(eq(schema.authCodes.email, email), isNull(schema.authCodes.consumedAt), gt(schema.authCodes.expiresAt, new Date())))
    .orderBy(sql`${schema.authCodes.createdAt} desc`)
    .limit(3);
  const expected = hmac(env.appSecret, `${email}:${code}`);
  const match = candidates.find((c) => c.codeHash === expected && c.attempts < MAX_ATTEMPTS);
  if (!match) {
    for (const c of candidates) {
      await db
        .update(schema.authCodes)
        .set({ attempts: c.attempts + 1 })
        .where(eq(schema.authCodes.id, c.id));
    }
    return { ok: false, error: "That code is not valid or has expired. Request a new one." };
  }
  await db.update(schema.authCodes).set({ consumedAt: new Date() }).where(eq(schema.authCodes.id, match.id));
  const user = await ensureUser(email);
  await createSession(user.id);
  return { ok: true };
}

export async function ensureUser(email: string) {
  const db = await getDb();
  const existing = await db.query.users.findFirst({ where: eq(schema.users.email, email) });
  if (existing) return existing;
  const [created] = await db
    .insert(schema.users)
    .values({ email, timezone: env.timezone })
    .returning();
  return created;
}

export async function createSession(userId: string) {
  const db = await getDb();
  const token = randomToken();
  const h = (await headers()).get("user-agent") ?? undefined;
  await db.insert(schema.sessions).values({
    userId,
    tokenHash: sha256(token),
    userAgent: h?.slice(0, 200),
    expiresAt: new Date(Date.now() + SESSION_DAYS * 86_400_000),
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
  // Opportunistic cleanup of expired sessions and codes.
  await db.delete(schema.sessions).where(lt(schema.sessions.expiresAt, new Date()));
  await db.delete(schema.authCodes).where(lt(schema.authCodes.expiresAt, new Date(Date.now() - 86_400_000)));
}

export async function signOut() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await db.delete(schema.sessions).where(eq(schema.sessions.tokenHash, sha256(token)));
  }
  jar.delete(SESSION_COOKIE);
}

/** Current signed-in owner or null. Cached per request by Next. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const db = await getDb();
  const row = await db
    .select({ user: schema.users, session: schema.sessions })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(and(eq(schema.sessions.tokenHash, sha256(token)), gt(schema.sessions.expiresAt, new Date())))
    .limit(1);
  const hit = row[0];
  if (!hit) return null;
  if (!isAllowedEmail(hit.user.email)) return null; // allowlist removal revokes access
  return hit.user;
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Not signed in");
  }
}

/** Use in server actions and route handlers. Throws when not signed in. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

/** Demo mode: sign in the demo owner directly (no email). */
export async function signInDemoOwner() {
  if (!env.isDemo) throw new Error("Demo sign-in is only available in demo mode.");
  const { seedDemoData } = await import("@/lib/demo-seed");
  await seedDemoData(); // fictional data on first demo sign-in; no-op afterwards
  const user = await ensureUser("demo@example.com");
  await createSession(user.id);
  return user;
}
