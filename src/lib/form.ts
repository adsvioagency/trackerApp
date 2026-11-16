/** Small helpers for reading FormData in server actions. */
import { parseMoney } from "@/lib/money/format";

export function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export function opt(fd: FormData, key: string): string | null {
  const v = str(fd, key);
  return v === "" ? null : v;
}

export function money(fd: FormData, key: string): number | null {
  const v = str(fd, key);
  if (!v) return null;
  return parseMoney(v);
}

export function num(fd: FormData, key: string, fallback = 0): number {
  const v = Number(str(fd, key));
  return Number.isFinite(v) ? v : fallback;
}

export function bool(fd: FormData, key: string): boolean {
  const v = fd.get(key);
  return v === "on" || v === "true" || v === "1";
}

export function isoDate(fd: FormData, key: string): string | null {
  const v = str(fd, key);
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

export function workspaceOf(fd: FormData, key = "workspace"): "personal" | "business" {
  return str(fd, key) === "business" ? "business" : "personal";
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return "Something went wrong. Please try again.";
}
