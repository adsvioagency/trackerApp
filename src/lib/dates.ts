/**
 * Date helpers. Calendar dates are "YYYY-MM-DD" strings interpreted in the
 * owner's timezone. Use these instead of `new Date(...)` arithmetic.
 */
import { addDays, addMonths, addWeeks, addYears, differenceInCalendarDays, format, getDaysInMonth, parseISO } from "date-fns";

export type ISODate = string; // YYYY-MM-DD

export function isISODate(s: unknown): s is ISODate {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/** Today's calendar date in the given IANA timezone. */
export function todayInTz(tz: string, now: Date = new Date()): ISODate {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Current hour (0-23) in the timezone. */
export function hourInTz(tz: string, now: Date = new Date()): number {
  const h = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hour12: false }).format(now);
  return Number(h) % 24;
}

export function toDate(d: ISODate): Date {
  return parseISO(d);
}

export function fromDate(d: Date): ISODate {
  return format(d, "yyyy-MM-dd");
}

export function addDaysISO(d: ISODate, n: number): ISODate {
  return fromDate(addDays(toDate(d), n));
}

export function daysBetween(a: ISODate, b: ISODate): number {
  return differenceInCalendarDays(toDate(b), toDate(a));
}

export function monthKey(d: ISODate): string {
  return d.slice(0, 7);
}

export function monthStart(month: string): ISODate {
  return `${month}-01`;
}

export function monthEnd(month: string): ISODate {
  const [y, m] = month.split("-").map(Number);
  const days = getDaysInMonth(new Date(y, m - 1, 1));
  return `${month}-${String(days).padStart(2, "0")}`;
}

export function addMonthsKey(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  return format(addMonths(new Date(y, m - 1, 1), n), "yyyy-MM");
}

export function yearStart(year: number): ISODate {
  return `${year}-01-01`;
}
export function yearEnd(year: number): ISODate {
  return `${year}-12-31`;
}

/**
 * Place `day` into `month`, clamping to the month's last valid day.
 * Returns the resulting date and whether it was clamped.
 */
export function dayInMonth(month: string, day: number): { date: ISODate; clamped: boolean } {
  const [y, m] = month.split("-").map(Number);
  const dim = getDaysInMonth(new Date(y, m - 1, 1));
  const d = Math.min(day, dim);
  return { date: `${month}-${String(d).padStart(2, "0")}`, clamped: d !== day };
}

export type Frequency = "once" | "daily" | "weekly" | "biweekly" | "semimonthly" | "monthly" | "yearly";

/**
 * Generate recurrence dates from an anchor up to `until` (inclusive).
 * For monthly/yearly rules the anchor's day-of-month is preserved and clamped in
 * short months. `scheduledDate` carries the nominal date (e.g. 2026-02-31 is
 * represented as the month key plus day so uniqueness per month holds).
 */
export function occurrencesBetween(
  rule: { frequency: Frequency; interval?: number; anchorDate: ISODate; daysOfMonth?: number[] | null; endDate?: ISODate | null },
  from: ISODate,
  until: ISODate,
): { date: ISODate; scheduledDate: ISODate; clamped: boolean }[] {
  const out: { date: ISODate; scheduledDate: ISODate; clamped: boolean }[] = [];
  const interval = Math.max(1, rule.interval ?? 1);
  const anchor = rule.anchorDate;
  const stop = rule.endDate && rule.endDate < until ? rule.endDate : until;
  const push = (date: ISODate, scheduledDate: ISODate, clamped: boolean) => {
    if (date >= from && date <= stop) out.push({ date, scheduledDate, clamped });
  };
  if (rule.frequency === "once") {
    push(anchor, anchor, false);
    return out;
  }
  if (rule.frequency === "daily" || rule.frequency === "weekly" || rule.frequency === "biweekly") {
    const step = rule.frequency === "daily" ? interval : rule.frequency === "weekly" ? 7 * interval : 14 * interval;
    let d = toDate(anchor);
    // fast-forward near `from`
    const skip = Math.max(0, Math.floor(differenceInCalendarDays(toDate(from), d) / step) - 1);
    d = addDays(d, skip * step);
    for (let i = 0; i < 2000; i++) {
      const iso = fromDate(d);
      if (iso > stop) break;
      push(iso, iso, false);
      d = addDays(d, step);
    }
    return out;
  }
  if (rule.frequency === "semimonthly") {
    const days = (rule.daysOfMonth && rule.daysOfMonth.length ? rule.daysOfMonth : [15, 31]).slice().sort((a, b) => a - b);
    let month = monthKey(anchor);
    const lastMonth = monthKey(stop);
    for (let i = 0; i < 600 && month <= lastMonth; i++) {
      for (const day of days) {
        const { date, clamped } = dayInMonth(month, day);
        const scheduled = `${month}-${String(day).padStart(2, "0")}`;
        if (date >= anchor) push(date, clamped ? date : scheduled, clamped);
      }
      month = addMonthsKey(month, 1);
    }
    return out;
  }
  if (rule.frequency === "monthly") {
    const day = Number(anchor.slice(8, 10));
    let month = monthKey(anchor);
    const lastMonth = monthKey(stop);
    for (let i = 0; i < 1200 && month <= lastMonth; i++) {
      const { date, clamped } = dayInMonth(month, day);
      push(date, date, clamped);
      month = addMonthsKey(month, interval);
    }
    return out;
  }
  if (rule.frequency === "yearly") {
    const mm = anchor.slice(5, 7);
    const day = Number(anchor.slice(8, 10));
    let y = Number(anchor.slice(0, 4));
    const lastYear = Number(stop.slice(0, 4));
    while (y <= lastYear) {
      const { date, clamped } = dayInMonth(`${y}-${mm}`, day);
      push(date, date, clamped);
      y += interval;
    }
    return out;
  }
  return out;
}

export function nextOccurrenceAfter(rule: Parameters<typeof occurrencesBetween>[0], after: ISODate): ISODate | null {
  const horizon = fromDate(addYears(toDate(after), 2));
  const list = occurrencesBetween(rule, addDaysISO(after, 1), horizon);
  return list[0]?.date ?? null;
}

export function fmtDate(d: ISODate | null | undefined, style: "short" | "medium" | "long" | "weekday" = "medium"): string {
  if (!d) return "—";
  const date = toDate(d);
  switch (style) {
    case "short":
      return format(date, "MMM d");
    case "weekday":
      return format(date, "EEE, MMM d");
    case "long":
      return format(date, "EEEE, MMMM d, yyyy");
    default:
      return format(date, "MMM d, yyyy");
  }
}

export function fmtMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return format(new Date(y, m - 1, 1), "MMMM yyyy");
}

export function fmtDateTime(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, dateStyle: "medium", timeStyle: "short" }).format(d);
}

export function fmtTime(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, timeStyle: "short" }).format(d);
}

/** Relative wording for Today lists: "today", "tomorrow", "in 3 days", "2 days overdue". */
export function relativeDay(target: ISODate, today: ISODate): string {
  const n = daysBetween(today, target);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  if (n > 1) return `in ${n} days`;
  return `${-n} days overdue`;
}

export { addWeeks, addMonths, addYears, format };

/** Combine a date and HH:MM in a timezone into a UTC instant. */
export function zonedDateTimeToUtc(date: ISODate, time: string, tz: string): Date {
  const [h, m] = time.split(":").map(Number);
  // Find the UTC instant whose wall time in tz is date+time (two-pass approximation).
  const guess = new Date(`${date}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`);
  const offsetMin = tzOffsetMinutes(tz, guess);
  return new Date(guess.getTime() - offsetMin * 60_000);
}

export function tzOffsetMinutes(tz: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/** Calendar date of an instant in a timezone. */
export function dateInTz(at: Date, tz: string): ISODate {
  return todayInTz(tz, at);
}

/** Add weeks to an ISO date. */
export function addWeeksISO(d: ISODate, n: number): ISODate {
  return fromDate(addWeeks(toDate(d), n));
}
export function addMonthsISO(d: ISODate, n: number): ISODate {
  return fromDate(addMonths(toDate(d), n));
}
export function addYearsISO(d: ISODate, n: number): ISODate {
  return fromDate(addYears(toDate(d), n));
}
