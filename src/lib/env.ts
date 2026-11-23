/**
 * Environment access. Server-only. Values are read lazily so scripts and tests
 * can set process.env before first use.
 */
import "server-only";

function str(name: string, fallback = ""): string {
  const v = process.env[name];
  return v === undefined || v === "" ? fallback : v;
}

export const env = {
  get appUrl() {
    return str("APP_URL", "http://localhost:3000").replace(/\/$/, "");
  },
  get appMode(): "live" | "demo" {
    return str("APP_MODE", "live") === "demo" ? "demo" : "live";
  },
  get isDemo() {
    return this.appMode === "demo";
  },
  get timezone() {
    return str("APP_TIMEZONE", "America/Santo_Domingo");
  },
  get ownerAccessKeyHash() {
    return str("OWNER_ACCESS_KEY_SHA256", "");
  },
  get ownerEmails(): string[] {
    const base = str("OWNER_EMAILS", "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    if (this.isDemo) base.push("demo@example.com");
    return base;
  },
  get appSecret() {
    return str("APP_SECRET", "insecure-dev-secret");
  },
  get databaseUrl() {
    return str("DATABASE_URL", "");
  },
  get emailTransport(): "console" | "resend" {
    if (this.isDemo) return "console"; // demo never sends real email
    return str("EMAIL_TRANSPORT", "console") === "resend" ? "resend" : "console";
  },
  get emailFrom() {
    return str("EMAIL_FROM", "Adsvio Assistant <assistant@localhost>");
  },
  get resendApiKey() {
    return str("RESEND_API_KEY", "");
  },
  get showDevCode() {
    return str("AUTH_DEV_SHOW_CODE", "false") === "true" && process.env.NODE_ENV !== "production";
  },
  get remindersDelivery(): boolean {
    return !this.isDemo && str("REMINDERS_DELIVERY", "off") === "on";
  },
  get cronSecret() {
    return str("CRON_SECRET", "");
  },
  get anthropicApiKey() {
    return str("ANTHROPIC_API_KEY", "");
  },
  get anthropicModel() {
    return str("ANTHROPIC_MODEL", "claude-opus-5-5");
  },
  get storageDriver(): "local" | "supabase" {
    return str("STORAGE_DRIVER", "local") === "supabase" ? "supabase" : "local";
  },
  get supabaseUrl() {
    return str("SUPABASE_URL", "");
  },
  get supabaseServiceRoleKey() {
    return str("SUPABASE_SERVICE_ROLE_KEY", "");
  },
  get supabaseBucket() {
    return str("SUPABASE_STORAGE_BUCKET", "private-files");
  },
  get dataDir() {
    return str("APP_DATA_DIR", this.isDemo ? "data/demo" : "data/live");
  },
};
