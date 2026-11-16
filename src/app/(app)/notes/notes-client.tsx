"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { cx } from "@/components/ui";

export function NotesSearch({ tags }: { tags: string[] }) {
  const router = useRouter();
  const sp = useSearchParams();
  const pathname = usePathname();
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(sp.toString());
    if (v) next.set(k, v);
    else next.delete(k);
    router.replace(`${pathname}?${next.toString()}`);
  };
  const active = sp.get("tag") ?? "";
  return (
    <div className="mb-4 space-y-2">
      <label className="relative block">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
        <input type="search" aria-label="Search notes" placeholder="Search notes" className="input pl-9" defaultValue={sp.get("q") ?? ""} onChange={(e) => set("q", e.target.value)} />
      </label>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className={cx("pill", active ? "pill-neutral" : "pill-mango")} onClick={() => set("tag", "")}>All</button>
          {tags.map((t) => <button key={t} type="button" className={cx("pill", active === t ? "pill-mango" : "pill-neutral")} onClick={() => set("tag", active === t ? "" : t)}>#{t}</button>)}
        </div>
      )}
    </div>
  );
}
