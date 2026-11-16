import type { CategoryTree } from "@/lib/money/categories";
import { fmtMoney } from "@/lib/money/format";

export type AccountOption = { id: string; name: string; currency: string; type: string; workspace: "personal" | "business"; balanceMinor?: number };

export function CategorySelect({ tree, name = "categoryId", id, defaultValue, kinds, allowEmpty = true, required, className = "select", onChange, value }: { tree: CategoryTree; name?: string; id?: string; defaultValue?: string | null; kinds?: string[]; allowEmpty?: boolean; required?: boolean; className?: string; onChange?: React.ChangeEventHandler<HTMLSelectElement>; value?: string }) {
  const groups = tree.filter((g) => !g.archived && (!kinds || kinds.includes(g.kind)));
  return (
    <select name={name} id={id} defaultValue={value === undefined ? defaultValue ?? "" : undefined} value={value} onChange={onChange} className={className} required={required}>
      {allowEmpty && <option value="">No category</option>}
      {groups.map((g) => (
        <optgroup key={g.id} label={g.name}>
          {g.categories
            .filter((c) => !c.archived)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.parentId ? "— " : ""}
                {c.name}
              </option>
            ))}
        </optgroup>
      ))}
    </select>
  );
}

export function AccountSelect({ accounts, name = "accountId", id, defaultValue, required = true, className = "select", onChange, value, allowEmpty, recentIds = [] }: { accounts: AccountOption[]; name?: string; id?: string; defaultValue?: string | null; required?: boolean; className?: string; onChange?: React.ChangeEventHandler<HTMLSelectElement>; value?: string; allowEmpty?: boolean; recentIds?: string[] }) {
  const sorted = [...accounts].sort((a, b) => {
    const ra = recentIds.indexOf(a.id);
    const rb = recentIds.indexOf(b.id);
    if (ra !== -1 || rb !== -1) return (ra === -1 ? 99 : ra) - (rb === -1 ? 99 : rb);
    return a.name.localeCompare(b.name);
  });
  return (
    <select name={name} id={id} defaultValue={value === undefined ? defaultValue ?? sorted[0]?.id ?? "" : undefined} value={value} onChange={onChange} className={className} required={required}>
      {allowEmpty && <option value="">No account</option>}
      {sorted.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name} · {a.currency}
          {a.balanceMinor !== undefined ? ` · ${fmtMoney(a.balanceMinor, a.currency)}` : ""}
        </option>
      ))}
    </select>
  );
}
