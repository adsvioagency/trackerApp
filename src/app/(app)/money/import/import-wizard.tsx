"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { parseCsv, parseDateLoose } from "@/lib/csv";
import type { ImportMapping, ImportRow } from "@/lib/money/import";
import { commitImportAction } from "@/app/(app)/money/actions";
import { Field, Notice, Pill, cx } from "@/components/ui";
import type { AccountOption } from "@/components/pickers";
import { parseMoney, fmtMoney } from "@/lib/money/format";

const FIELDS: { key: keyof Pick<ImportMapping, "date" | "merchant" | "amount" | "inflow" | "outflow" | "category" | "subcategory" | "description">; label: string; hints: string[] }[] = [
  { key: "date", label: "Date", hints: ["date", "fecha"] },
  { key: "merchant", label: "Merchant", hints: ["merchant", "payee", "comercio", "name"] },
  { key: "amount", label: "Amount (single column)", hints: ["amount", "monto", "total"] },
  { key: "outflow", label: "Money out (optional)", hints: ["outflow", "debit", "expense", "gasto"] },
  { key: "inflow", label: "Money in (optional)", hints: ["inflow", "credit", "income", "ingreso"] },
  { key: "category", label: "Category", hints: ["category", "categoria", "categoría"] },
  { key: "subcategory", label: "Subcategory", hints: ["subcategory", "sub category", "subcategoria"] },
  { key: "description", label: "Description / note", hints: ["description", "note", "memo", "descripcion", "descripción"] },
];

async function sha1(text: string) {
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function ImportWizard({ accounts, defaultWorkspace }: { accounts: AccountOption[]; defaultWorkspace: "personal" | "business" }) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [filename, setFilename] = useState("");
  const [grid, setGrid] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<ImportMapping>({ date: null, merchant: null, amount: null, inflow: null, outflow: null, category: null, subcategory: null, description: null, positiveIsExpense: true, dayFirst: false, skipHeader: true });
  const [workspace, setWorkspace] = useState<"personal" | "business">(defaultWorkspace);
  const [accountId, setAccountId] = useState(accounts.find((a) => a.workspace === defaultWorkspace)?.id ?? "");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [createCats, setCreateCats] = useState(true);
  const [skipDup, setSkipDup] = useState(true);
  const [result, setResult] = useState<Awaited<ReturnType<typeof commitImportAction>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const account = accounts.find((a) => a.id === accountId);
  const header = grid[0] ?? [];

  const onFile = async (f: File) => {
    const text = await f.text();
    const parsed = parseCsv(text);
    if (!parsed.length) return setError("That file looks empty.");
    setError(null);
    setFilename(f.name);
    setGrid(parsed);
    const head = parsed[0].map((h) => h.trim().toLowerCase());
    const next = { ...mapping };
    for (const f of FIELDS) {
      const idx = head.findIndex((h) => f.hints.some((hint) => h === hint || h.includes(hint)));
      (next as Record<string, unknown>)[f.key] = idx >= 0 ? idx : null;
    }
    if (next.amount !== null) {
      next.inflow = null;
      next.outflow = null;
    }
    setMapping(next);
    setStep(2);
  };

  const buildPreview = async () => {
    if (!account) return setError("Choose the account these transactions belong to.");
    if (mapping.date === null || (mapping.amount === null && mapping.outflow === null && mapping.inflow === null)) return setError("Map at least the date and an amount column.");
    setError(null);
    const body = mapping.skipHeader ? grid.slice(1) : grid;
    const out: ImportRow[] = [];
    for (let i = 0; i < body.length; i++) {
      const r = body[i];
      const get = (idx: number | null | undefined) => (idx === null || idx === undefined ? null : (r[idx] ?? "").trim() || null);
      const date = parseDateLoose(get(mapping.date) ?? "", mapping.dayFirst);
      let amountMinor: number | null = null;
      let kind: "expense" | "income" = "expense";
      if (mapping.amount !== null) {
        const v = parseMoney(get(mapping.amount) ?? "");
        if (v !== null) {
          const negative = v < 0;
          amountMinor = Math.abs(v);
          kind = mapping.positiveIsExpense ? (negative ? "income" : "expense") : negative ? "expense" : "income";
        }
      } else {
        const outV = parseMoney(get(mapping.outflow) ?? "");
        const inV = parseMoney(get(mapping.inflow) ?? "");
        if (outV && outV !== 0) {
          amountMinor = Math.abs(outV);
          kind = "expense";
        } else if (inV && inV !== 0) {
          amountMinor = Math.abs(inV);
          kind = "income";
        }
      }
      const merchant = get(mapping.merchant);
      const row: ImportRow = { index: i, date, merchant, amountMinor, kind, category: get(mapping.category), subcategory: get(mapping.subcategory), description: get(mapping.description), hash: "" };
      if (!date) row.error = "Unreadable date";
      else if (!amountMinor) row.error = "No amount";
      row.hash = row.error ? `err-${i}` : await sha1(`${date}|${(merchant ?? "").toLowerCase().trim()}|${amountMinor}|${account.id}|${kind}`);
      out.push(row);
    }
    // Detect duplicates inside the file itself
    const seen = new Set<string>();
    for (const r of out) {
      if (r.error) continue;
      if (seen.has(r.hash)) r.duplicate = true;
      seen.add(r.hash);
    }
    setRows(out);
    setStep(3);
  };

  const summary = useMemo(() => ({ ok: rows.filter((r) => !r.error).length, errors: rows.filter((r) => r.error).length, dup: rows.filter((r) => r.duplicate).length, expenses: rows.filter((r) => !r.error && r.kind === "expense").reduce((s, r) => s + (r.amountMinor ?? 0), 0), income: rows.filter((r) => !r.error && r.kind === "income").reduce((s, r) => s + (r.amountMinor ?? 0), 0) }), [rows]);

  const commit = () =>
    start(async () => {
      try {
        const res = await commitImportAction({ workspace, accountId, filename, mapping, rows: rows.filter((r) => !r.duplicate || !skipDup), createMissingCategories: createCats, skipDuplicates: skipDup });
        setResult(res);
        setStep(4);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Import failed.");
      }
    });

  return (
    <div className="space-y-4">
      <ol className="flex flex-wrap gap-2 text-[12px] font-semibold uppercase tracking-wide">
        {["Choose file", "Map columns", "Preview", "Result"].map((s, i) => (
          <li key={s} className={cx("rounded-full px-3 py-1", step === i + 1 ? "bg-ink text-paper" : step > i + 1 ? "bg-ok-wash text-ok" : "bg-surface-2 text-ink-soft")}>
            {i + 1}. {s}
          </li>
        ))}
      </ol>
      {error && <Notice tone="danger">{error}</Notice>}

      {step === 1 && (
        <div className="card p-5">
          <Field label="CSV file" htmlFor="csv" hint="Nothing is uploaded until you confirm the import. The file is read in your browser.">
            <input id="csv" type="file" accept=".csv,text/csv" className="input" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          </Field>
        </div>
      )}

      {step === 2 && (
        <div className="card space-y-4 p-5">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Workspace" htmlFor="imp-ws"><select id="imp-ws" className="select" value={workspace} onChange={(e) => { setWorkspace(e.target.value as "personal"); setAccountId(accounts.find((a) => a.workspace === e.target.value)?.id ?? ""); }}><option value="personal">Personal</option><option value="business">Business</option></select></Field>
            <Field label="Account (sets the currency)" htmlFor="imp-acc"><select id="imp-acc" className="select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>{accounts.filter((a) => a.workspace === workspace).map((a) => <option key={a.id} value={a.id}>{a.name} · {a.currency}</option>)}</select></Field>
          </div>
          {account && <Notice tone="neutral">Amounts will be recorded in {account.currency} ({account.currency === "DOP" ? "RD$" : "US$"}) on {account.name}.</Notice>}
          <div className="grid gap-3 md:grid-cols-2">
            {FIELDS.map((f) => (
              <Field key={f.key} label={f.label} htmlFor={`map-${f.key}`}>
                <select id={`map-${f.key}`} className="select" value={mapping[f.key] ?? ""} onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value === "" ? null : Number(e.target.value) })}>
                  <option value="">— not in file —</option>
                  {header.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                </select>
              </Field>
            ))}
          </div>
          <div className="flex flex-wrap gap-4 text-[14px]">
            <label className="flex items-center gap-2"><input type="checkbox" className="size-4 accent-[var(--mango-deep)]" checked={mapping.positiveIsExpense} onChange={(e) => setMapping({ ...mapping, positiveIsExpense: e.target.checked })} /> Positive amounts are expenses</label>
            <label className="flex items-center gap-2"><input type="checkbox" className="size-4 accent-[var(--mango-deep)]" checked={mapping.dayFirst} onChange={(e) => setMapping({ ...mapping, dayFirst: e.target.checked })} /> Dates are day/month/year</label>
            <label className="flex items-center gap-2"><input type="checkbox" className="size-4 accent-[var(--mango-deep)]" checked={mapping.skipHeader} onChange={(e) => setMapping({ ...mapping, skipHeader: e.target.checked })} /> First row is a header</label>
          </div>
          <div className="overflow-x-auto rounded-lg border border-rule">
            <table className="table text-[12px]"><tbody>{grid.slice(0, 4).map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="whitespace-nowrap">{c}</td>)}</tr>)}</tbody></table>
          </div>
          <div className="flex gap-2"><button type="button" className="btn btn-primary" onClick={buildPreview}>Preview</button><button type="button" className="btn btn-ghost" onClick={() => setStep(1)}>Back</button></div>
        </div>
      )}

      {step === 3 && (
        <div className="card space-y-4 p-5">
          <div className="flex flex-wrap gap-2 text-[13px]">
            <Pill tone="ok">{summary.ok} ready</Pill>
            {summary.errors > 0 && <Pill tone="danger">{summary.errors} unreadable</Pill>}
            {summary.dup > 0 && <Pill tone="warn">{summary.dup} duplicates in file</Pill>}
            <Pill>Expenses {fmtMoney(summary.expenses, account?.currency)}</Pill>
            <Pill>Income {fmtMoney(summary.income, account?.currency)}</Pill>
          </div>
          <Notice tone="neutral">Duplicates already in your ledger (same date, merchant, amount, account) are detected again on the server and skipped when the option below is on.</Notice>
          <div className="flex flex-wrap gap-4 text-[14px]">
            <label className="flex items-center gap-2"><input type="checkbox" className="size-4 accent-[var(--mango-deep)]" checked={skipDup} onChange={(e) => setSkipDup(e.target.checked)} /> Skip duplicates</label>
            <label className="flex items-center gap-2"><input type="checkbox" className="size-4 accent-[var(--mango-deep)]" checked={createCats} onChange={(e) => setCreateCats(e.target.checked)} /> Create missing categories (subcategory name wins, else category)</label>
          </div>
          <div className="max-h-[420px] overflow-auto rounded-lg border border-rule">
            <table className="table text-[12px]">
              <thead><tr><th>#</th><th>Date</th><th>Merchant</th><th className="num">Amount</th><th>Type</th><th>Category</th><th>Status</th></tr></thead>
              <tbody>
                {rows.slice(0, 300).map((r) => (
                  <tr key={r.index} className={cx(r.error && "bg-danger-wash/40", r.duplicate && "opacity-60")}>
                    <td>{r.index + 1}</td><td>{r.date ?? "—"}</td><td>{r.merchant ?? "—"}</td><td className="num">{r.amountMinor ? fmtMoney(r.amountMinor, account?.currency) : "—"}</td><td>{r.kind}</td><td>{r.subcategory ?? r.category ?? "—"}</td><td>{r.error ? <span className="text-danger">{r.error}</span> : r.duplicate ? "Duplicate" : "Ready"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 300 && <p className="muted p-2 text-[12px]">Showing the first 300 of {rows.length} rows.</p>}
          </div>
          <div className="flex gap-2"><button type="button" className="btn btn-primary" disabled={pending || summary.ok === 0} onClick={commit}>{pending ? "Importing…" : `Import ${summary.ok - (skipDup ? summary.dup : 0)} transactions`}</button><button type="button" className="btn btn-ghost" onClick={() => setStep(2)}>Back</button></div>
        </div>
      )}

      {step === 4 && result && (
        <div className="card space-y-3 p-5">
          <Notice tone="ok">Imported {result.imported} transaction(s). Skipped {result.skippedDuplicates} duplicate(s). {result.errors} row(s) could not be read.</Notice>
          {result.createdCategories.length > 0 && <p className="text-[14px]">New categories created: {result.createdCategories.join(", ")}.</p>}
          <div className="flex gap-2"><Link href="/money/transactions?all=1" className="btn btn-primary">View transactions</Link><button type="button" className="btn btn-ghost" onClick={() => { setStep(1); setRows([]); setGrid([]); setResult(null); }}>Import another file</button></div>
        </div>
      )}
    </div>
  );
}
