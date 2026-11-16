"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Field, Notice } from "@/components/ui";
import { AccountSelect, CategorySelect, type AccountOption } from "@/components/pickers";
import type { CategoryTree } from "@/lib/money/categories";
import { QuickForm } from "./frame";
import { addExpenseAction, addIncomeAction, addTransferAction } from "@/app/(app)/add/actions";
import { fmtMoney } from "@/lib/money/format";

export type Ref = { id: string; name: string; clientId?: string | null };

export type MoneyFormData = {
  workspace: "personal" | "business";
  accounts: AccountOption[];
  tree: CategoryTree;
  today: string;
  recentAccountIds: string[];
  recentMerchants: { merchant: string; categoryId: string | null }[];
  clients: Ref[];
  projects: Ref[];
  goals: { id: string; name: string; accountId: string | null }[];
  backHref: string;
};

function useCurrencyOf(accounts: AccountOption[], accountId: string) {
  return useMemo(() => accounts.find((a) => a.id === accountId)?.currency ?? "DOP", [accounts, accountId]);
}

export function DopEquivalentField({ currency, label = "DOP equivalent you calculated", required }: { currency: string; label?: string; required?: boolean }) {
  if (currency === "DOP") return null;
  return (
    <Field label={label} htmlFor="dopEquivalent" hint="Used for reports. Leave empty to flag it as needing a value later.">
      <input id="dopEquivalent" name="dopEquivalent" className="input" inputMode="decimal" placeholder="e.g. 24,000.00" required={required} />
    </Field>
  );
}

export function ClientProjectFields({ clients, projects, defaultClientId, defaultProjectId }: { clients: Ref[]; projects: Ref[]; defaultClientId?: string | null; defaultProjectId?: string | null }) {
  const [clientId, setClientId] = useState(defaultClientId ?? "");
  const filtered = clientId ? projects.filter((p) => p.clientId === clientId) : projects;
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="Client (optional)" htmlFor="clientId">
        <select id="clientId" name="clientId" className="select" value={clientId} onChange={(e) => setClientId(e.target.value)}>
          <option value="">None</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Project (optional)" htmlFor="projectId">
        <select id="projectId" name="projectId" className="select" defaultValue={defaultProjectId ?? ""}>
          <option value="">None</option>
          {filtered.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}

type SplitLine = { id: number; categoryId: string; amount: string; note: string };

export function SplitEditor({ tree, total, kinds }: { tree: CategoryTree; total: number; kinds: string[] }) {
  const [enabled, setEnabled] = useState(false);
  const [lines, setLines] = useState<SplitLine[]>([
    { id: 1, categoryId: "", amount: "", note: "" },
    { id: 2, categoryId: "", amount: "", note: "" },
  ]);
  const sum = lines.reduce((s, l) => s + (Number(l.amount.replace(/,/g, "")) || 0), 0);
  const diff = Math.round(total * 100) - Math.round(sum * 100);
  return (
    <div className="rounded-xl border border-rule p-3">
      <label className="flex items-center gap-2 text-[14px] font-medium">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="size-4 accent-[var(--mango-deep)]" />
        Split across categories
      </label>
      {enabled && (
        <div className="mt-3 space-y-2">
          <input type="hidden" name="splits" value={JSON.stringify(lines.filter((l) => l.amount))} />
          {lines.map((l, i) => (
            <div key={l.id} className="grid grid-cols-[1fr_110px_36px] gap-2">
              <CategorySelect tree={tree} kinds={kinds} name={`split-cat-${i}`} value={l.categoryId} onChange={(e) => setLines(lines.map((x) => (x.id === l.id ? { ...x, categoryId: e.target.value } : x)))} />
              <input aria-label={`Split ${i + 1} amount`} className="input" inputMode="decimal" placeholder="0.00" value={l.amount} onChange={(e) => setLines(lines.map((x) => (x.id === l.id ? { ...x, amount: e.target.value } : x)))} />
              <button type="button" className="btn btn-ghost btn-icon" aria-label="Remove line" onClick={() => setLines(lines.filter((x) => x.id !== l.id))}>
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
          <div className="flex items-center justify-between">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLines([...lines, { id: Date.now(), categoryId: "", amount: "", note: "" }])}>
              <Plus className="size-4" /> Add line
            </button>
            <span className={`text-[13px] font-semibold ${diff === 0 ? "text-ok" : "text-warn"}`}>{diff === 0 ? "Lines match the total" : diff > 0 ? `${fmtMoney(diff, "")} left to allocate` : `${fmtMoney(-diff, "")} over the total`}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function ExpenseForm({ data, kind = "expense" }: { data: MoneyFormData; kind?: "expense" | "refund" | "owner_draw" }) {
  const [accountId, setAccountId] = useState(data.recentAccountIds[0] ?? data.accounts[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const currency = useCurrencyOf(data.accounts, accountId);
  const title = kind === "refund" ? "Add refund" : kind === "owner_draw" ? "Owner draw" : "Add expense";
  if (!data.accounts.length) {
    return (
      <QuickForm action={addExpenseAction} title={title} workspace={data.workspace} backHref={data.backHref}>
        {() => <Notice tone="warn">Add an account first (Money → Accounts).</Notice>}
      </QuickForm>
    );
  }
  return (
    <QuickForm action={addExpenseAction} title={title} workspace={data.workspace} backHref={data.backHref} doneHref="/money/transactions" recordHref={(id) => `/money/transactions/${id}`} hiddenFields={{ workspace: data.workspace, kind }}>
      {() => (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount" htmlFor="amount">
              <input id="amount" name="amount" className="input text-[20px] font-bold" inputMode="decimal" placeholder="0.00" required autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            <Field label="Date" htmlFor="date">
              <input id="date" name="date" type="date" className="input" defaultValue={data.today} required />
            </Field>
          </div>
          <Field label="Account" htmlFor="accountId">
            <AccountSelect accounts={data.accounts} recentIds={data.recentAccountIds} value={accountId} onChange={(e) => setAccountId(e.target.value)} id="accountId" />
          </Field>
          <DopEquivalentField currency={currency} />
          <Field label="Category" htmlFor="categoryId">
            <CategorySelect tree={data.tree} kinds={["expenses", "bills", "debt", "savings"]} id="categoryId" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} />
          </Field>
          <Field label={kind === "owner_draw" ? "Description" : "Merchant"} htmlFor="merchant">
            <input id="merchant" name="merchant" className="input" list="recent-merchants" placeholder={kind === "owner_draw" ? "e.g. Owner draw for November" : "e.g. Supermercado Nacional"} onChange={(e) => {
              const hit = data.recentMerchants.find((m) => m.merchant === e.target.value);
              if (hit?.categoryId && !categoryId) setCategoryId(hit.categoryId);
            }} />
            <datalist id="recent-merchants">
              {data.recentMerchants.map((m) => (
                <option key={m.merchant} value={m.merchant} />
              ))}
            </datalist>
          </Field>
          {data.recentMerchants.length > 0 && (
            <div className="-mt-2 flex flex-wrap gap-1.5">
              {data.recentMerchants.slice(0, 6).map((m) => (
                <button
                  key={m.merchant}
                  type="button"
                  className="pill pill-neutral hover:bg-mango-wash hover:text-mango-deep"
                  onClick={() => {
                    const el = document.getElementById("merchant") as HTMLInputElement | null;
                    if (el) el.value = m.merchant;
                    if (m.categoryId) setCategoryId(m.categoryId);
                  }}
                >
                  {m.merchant}
                </button>
              ))}
            </div>
          )}
          {kind === "expense" && <SplitEditor tree={data.tree} total={Number(amount.replace(/,/g, "")) || 0} kinds={["expenses", "bills", "debt", "savings"]} />}
          {data.workspace === "business" && <ClientProjectFields clients={data.clients} projects={data.projects} />}
          <Field label="Note (optional)" htmlFor="note">
            <input id="note" name="note" className="input" />
          </Field>
          <Field label="Receipt (optional)" htmlFor="receipt" hint="Image or PDF, up to 10 MB. Stored privately.">
            <input id="receipt" name="receipt" type="file" accept="image/*,application/pdf" className="input" />
          </Field>
          {kind === "owner_draw" && <Notice tone="neutral">Owner draws and contributions are tracked as owner movements, outside operating income and expenses.</Notice>}
        </>
      )}
    </QuickForm>
  );
}

export function IncomeForm({ data, kind = "income" }: { data: MoneyFormData; kind?: "income" | "owner_contribution" }) {
  const [accountId, setAccountId] = useState(data.recentAccountIds[0] ?? data.accounts[0]?.id ?? "");
  const currency = useCurrencyOf(data.accounts, accountId);
  const title = kind === "owner_contribution" ? "Owner contribution" : "Add income";
  if (!data.accounts.length) {
    return (
      <QuickForm action={addIncomeAction} title={title} workspace={data.workspace} backHref={data.backHref}>
        {() => <Notice tone="warn">Add an account first (Money → Accounts).</Notice>}
      </QuickForm>
    );
  }
  return (
    <QuickForm action={addIncomeAction} title={title} workspace={data.workspace} backHref={data.backHref} doneHref="/money/transactions" recordHref={(id) => `/money/transactions/${id}`} hiddenFields={{ workspace: data.workspace, kind }}>
      {() => (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount" htmlFor="amount">
              <input id="amount" name="amount" className="input text-[20px] font-bold" inputMode="decimal" placeholder="0.00" required autoFocus />
            </Field>
            <Field label="Date" htmlFor="date">
              <input id="date" name="date" type="date" className="input" defaultValue={data.today} required />
            </Field>
          </div>
          <Field label="Deposited to" htmlFor="accountId">
            <AccountSelect accounts={data.accounts} recentIds={data.recentAccountIds} value={accountId} onChange={(e) => setAccountId(e.target.value)} id="accountId" />
          </Field>
          <DopEquivalentField currency={currency} />
          {kind === "income" && (
            <Field label="Category" htmlFor="categoryId">
              <CategorySelect tree={data.tree} kinds={["income"]} id="categoryId" />
            </Field>
          )}
          <Field label="Source" htmlFor="merchant">
            <input id="merchant" name="merchant" className="input" placeholder={data.workspace === "business" ? "e.g. Client name" : "e.g. Employer"} />
          </Field>
          {data.workspace === "business" && kind === "income" && (
            <>
              <Notice tone="neutral">For a client payment on an invoice or project, use Record client payment instead so it updates the invoice too.</Notice>
              <ClientProjectFields clients={data.clients} projects={data.projects} />
            </>
          )}
          <Field label="Note (optional)" htmlFor="note">
            <input id="note" name="note" className="input" />
          </Field>
        </>
      )}
    </QuickForm>
  );
}

export function TransferForm({ data, allAccounts }: { data: MoneyFormData; allAccounts: AccountOption[] }) {
  const [from, setFrom] = useState(data.recentAccountIds[0] ?? allAccounts[0]?.id ?? "");
  const [to, setTo] = useState(allAccounts.find((a) => a.id !== from)?.id ?? "");
  const fromCur = useCurrencyOf(allAccounts, from);
  const toCur = useCurrencyOf(allAccounts, to);
  const toAcc = allAccounts.find((a) => a.id === to);
  const isCardPayment = toAcc?.type === "credit_card" || toAcc?.type === "loan";
  const crossWs = allAccounts.find((a) => a.id === from)?.workspace !== toAcc?.workspace;
  return (
    <QuickForm action={addTransferAction} title="Transfer between accounts" workspace={data.workspace} backHref={data.backHref} doneHref="/money/transactions" recordHref={(id) => `/money/transactions/${id}`} submitLabel="Record transfer">
      {() => (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount" htmlFor="amount">
              <input id="amount" name="amount" className="input text-[20px] font-bold" inputMode="decimal" placeholder="0.00" required autoFocus />
            </Field>
            <Field label="Date" htmlFor="date">
              <input id="date" name="date" type="date" className="input" defaultValue={data.today} required />
            </Field>
          </div>
          <Field label="From" htmlFor="fromAccountId">
            <AccountSelect accounts={allAccounts} name="fromAccountId" id="fromAccountId" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="To" htmlFor="toAccountId">
            <AccountSelect accounts={allAccounts.filter((a) => a.id !== from)} name="toAccountId" id="toAccountId" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          {fromCur !== toCur && (
            <Field label={`Amount received in ${toCur}`} htmlFor="toAmount" hint="Currencies differ, so enter what actually landed.">
              <input id="toAmount" name="toAmount" className="input" inputMode="decimal" required />
            </Field>
          )}
          {fromCur !== "DOP" && toCur !== "DOP" && <DopEquivalentField currency={fromCur} label="DOP equivalent (optional)" />}
          {isCardPayment && <Notice tone="ok">Paying a card or loan: this reduces cash and the balance owed. Purchases already recorded on the card are not counted again.</Notice>}
          {crossWs && <Notice tone="neutral">This moves money between Personal and Business. It is an internal transfer and stays out of combined income and spending.</Notice>}
          {data.goals.length > 0 && (
            <Field label="Counts toward a savings goal (optional)" htmlFor="goalId">
              <select id="goalId" name="goalId" className="select" defaultValue={data.goals.find((g) => g.accountId === to)?.id ?? ""}>
                <option value="">No goal</option>
                {data.goals.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Note (optional)" htmlFor="note">
            <input id="note" name="note" className="input" />
          </Field>
        </>
      )}
    </QuickForm>
  );
}
