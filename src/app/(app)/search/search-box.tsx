"use client";

import { Search } from "lucide-react";

export function SearchBox({ initial }: { initial: string }) {
  return (
    <form action="/search" method="get" className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-ink-muted" />
      <input type="search" name="q" aria-label="Search everything" placeholder="Search everything…" className="input pl-10 text-[16px]" defaultValue={initial} autoFocus />
    </form>
  );
}
