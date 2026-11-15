import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { fmtMoney } from "@/lib/money/format";

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  children,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-col gap-3 md:mb-6 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
        <h1 className="text-[26px] font-extrabold leading-tight md:text-[30px]">{title}</h1>
        {description && <p className="muted mt-1 text-[14px]">{description}</p>}
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Card({ children, className = "", title, action, as: Tag = "section" }: { children: ReactNode; className?: string; title?: ReactNode; action?: ReactNode; as?: "section" | "div" | "article" }) {
  return (
    <Tag className={cx("card p-4 md:p-5", className)}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title && <h2 className="text-[15px] font-bold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </Tag>
  );
}

export function Pill({ children, tone = "neutral", className = "" }: { children: ReactNode; tone?: "neutral" | "mango" | "teal" | "ok" | "warn" | "danger" | "personal" | "business"; className?: string }) {
  return <span className={cx("pill", `pill-${tone}`, className)}>{children}</span>;
}

export function WorkspaceBadge({ workspace }: { workspace: "personal" | "business" }) {
  return <Pill tone={workspace}>{workspace === "personal" ? "Personal" : "Business"}</Pill>;
}

export function Money({ minor, currency = "DOP", signed, className = "", compact }: { minor: number | null | undefined; currency?: string; signed?: boolean; className?: string; compact?: boolean }) {
  const negative = (minor ?? 0) < 0;
  return (
    <span className={cx("money tnum", negative && "text-danger", className)}>
      {fmtMoney(minor, currency, { signed, compact })}
    </span>
  );
}

export function Stat({ label, value, hint, href, tone }: { label: ReactNode; value: ReactNode; hint?: ReactNode; href?: string; tone?: "ok" | "warn" | "danger" }) {
  const body = (
    <>
      <div className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-soft">{label}</div>
      <div className={cx("mt-1 font-display text-[22px] font-extrabold leading-none md:text-[24px]", tone === "danger" && "text-danger", tone === "warn" && "text-warn", tone === "ok" && "text-ok")}>{value}</div>
      {hint && <div className="muted mt-1.5 text-[12px] leading-snug">{hint}</div>}
    </>
  );
  if (href) {
    return (
      <Link href={href} className="card block p-3.5 transition-colors hover:bg-surface-2 md:p-4">
        {body}
      </Link>
    );
  }
  return <div className="card p-3.5 md:p-4">{body}</div>;
}

export function EmptyState({ title, body, action }: { title: ReactNode; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-rule-strong bg-surface-2/60 px-4 py-8 text-center">
      <div className="font-semibold">{title}</div>
      {body && <p className="muted mx-auto mt-1 max-w-sm text-[14px]">{body}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function Field({ label, htmlFor, hint, error, children, className = "" }: { label: ReactNode; htmlFor?: string; hint?: ReactNode; error?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && !error && <p className="muted mt-1 text-[12px]">{hint}</p>}
      {error && (
        <p className="mt-1 text-[12px] font-medium text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function RowLink({ href, left, title, subtitle, right, badge }: { href: string; left?: ReactNode; title: ReactNode; subtitle?: ReactNode; right?: ReactNode; badge?: ReactNode }) {
  return (
    <Link href={href} className="row-link group -mx-1 px-1 hover:bg-surface-2/70">
      {left && <div className="shrink-0">{left}</div>}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{title}</span>
          {badge}
        </div>
        {subtitle && <div className="muted truncate text-[13px]">{subtitle}</div>}
      </div>
      {right && <div className="shrink-0 text-right">{right}</div>}
      <ChevronRight className="size-4 shrink-0 text-ink-muted" aria-hidden />
    </Link>
  );
}

export function ProgressBar({ value, max, label, tone }: { value: number; max: number; label?: string; tone?: "auto" | "ok" | "near" | "over" }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const auto = max > 0 && value > max ? "over" : max > 0 && value / max >= 0.85 ? "near" : "";
  const cls = tone === "over" ? "over" : tone === "near" ? "near" : tone === "ok" ? "" : auto;
  return (
    <div className={cx("bar", cls)} role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.min(value, max)} aria-label={label}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Notice({ tone = "neutral", children, className = "" }: { tone?: "neutral" | "ok" | "warn" | "danger" | "mango"; children: ReactNode; className?: string }) {
  const map = {
    neutral: "bg-surface-2 text-ink-soft border-rule",
    ok: "bg-ok-wash text-ok border-transparent",
    warn: "bg-warn-wash text-warn border-transparent",
    danger: "bg-danger-wash text-danger border-transparent",
    mango: "bg-mango-wash text-mango-deep border-transparent",
  } as const;
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cx("rounded-[10px] border px-3 py-2 text-[13px] font-medium", map[tone], className)}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 mt-6 flex items-center justify-between first:mt-0">
      <h2 className="text-[13px] font-bold uppercase tracking-[0.08em] text-ink-soft">{children}</h2>
      {action}
    </div>
  );
}

export function Segmented<T extends string>({ value, options, hrefFor, ariaLabel }: { value: T; options: { value: T; label: string }[]; hrefFor: (v: T) => string; ariaLabel: string }) {
  return (
    <nav aria-label={ariaLabel} className="inline-flex max-w-full overflow-x-auto rounded-[10px] border border-rule bg-surface p-0.5">
      {options.map((o) => (
        <Link
          key={o.value}
          href={hrefFor(o.value)}
          aria-current={o.value === value ? "page" : undefined}
          className={cx("rounded-lg px-3 py-1.5 text-[13px] font-medium whitespace-nowrap", o.value === value ? "bg-ink text-paper" : "text-ink-soft hover:bg-surface-2 hover:text-ink")}
        >
          {o.label}
        </Link>
      ))}
    </nav>
  );
}
