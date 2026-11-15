/**
 * Email transport interface.
 * - console: prints to the terminal and writes a copy to ./data/<mode>/outbox.
 *   No real delivery. Used locally, in tests and always in demo mode.
 * - resend: HTTPS API (https://resend.com). Supports an Idempotency-Key header
 *   so a retried send never delivers twice.
 */
import "server-only";
import fs from "node:fs";
import path from "node:path";
import { env } from "@/lib/env";

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** Stable key per logical message; retries reuse it. */
  idempotencyKey?: string;
};

export type EmailResult = { ok: true; id: string; transport: string } | { ok: false; error: string; transport: string };

export interface EmailTransport {
  readonly name: string;
  send(message: EmailMessage): Promise<EmailResult>;
}

export class ConsoleTransport implements EmailTransport {
  readonly name = "console";
  constructor(private readonly outboxDir: string) {}
  async send(message: EmailMessage): Promise<EmailResult> {
    const id = `console-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const line = `\n──────── EMAIL (not delivered · console transport) ────────\nTo: ${message.to}\nSubject: ${message.subject}\n\n${message.text}\n────────────────────────────────────────────────────────────\n`;
    console.log(line);
    try {
      fs.mkdirSync(this.outboxDir, { recursive: true });
      fs.writeFileSync(
        path.join(this.outboxDir, `${new Date().toISOString().replace(/[:.]/g, "-")}-${id}.json`),
        JSON.stringify({ id, ...message, sentAt: new Date().toISOString() }, null, 2),
      );
    } catch {
      // outbox is best-effort
    }
    return { ok: true, id, transport: this.name };
  }
}

/** Collects messages in memory. Used by tests. */
export class MemoryTransport implements EmailTransport {
  readonly name = "memory";
  readonly sent: EmailMessage[] = [];
  async send(message: EmailMessage): Promise<EmailResult> {
    this.sent.push(message);
    return { ok: true, id: `mem-${this.sent.length}`, transport: this.name };
  }
}

export class ResendTransport implements EmailTransport {
  readonly name = "resend";
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}
  async send(message: EmailMessage): Promise<EmailResult> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
    if (message.idempotencyKey) headers["Idempotency-Key"] = message.idempotencyKey.slice(0, 256);
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers,
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `Resend ${res.status}: ${body.slice(0, 300)}`, transport: this.name };
    }
    const json = (await res.json()) as { id?: string };
    return { ok: true, id: json.id ?? "unknown", transport: this.name };
  }
}

let override: EmailTransport | null = null;
/** Tests and scripts can swap the transport. */
export function setEmailTransportForTesting(t: EmailTransport | null) {
  override = t;
}

export function getEmailTransport(): EmailTransport {
  if (override) return override;
  if (env.emailTransport === "resend" && env.resendApiKey) {
    return new ResendTransport(env.resendApiKey, env.emailFrom);
  }
  return new ConsoleTransport(path.join(process.cwd(), env.dataDir, "outbox"));
}
