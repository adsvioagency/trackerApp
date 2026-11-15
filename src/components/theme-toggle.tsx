"use client";

import { useEffect, useState } from "react";
import { Moon, Sun, MonitorSmartphone } from "lucide-react";

type Pref = "light" | "dark" | "system";

export function applyTheme(pref: Pref) {
  const dark = pref === "dark" || (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  document.documentElement.setAttribute("data-theme-pref", pref);
  try {
    localStorage.setItem("pa-theme", pref);
  } catch {}
}

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [pref, setPref] = useState<Pref>("system");
  useEffect(() => {
    try {
      const saved = (localStorage.getItem("pa-theme") as Pref) || "system";
      setPref(saved);
    } catch {}
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const current = (localStorage.getItem("pa-theme") as Pref) || "system";
      if (current === "system") applyTheme("system");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const options: { value: Pref; label: string; icon: React.ReactNode }[] = [
    { value: "light", label: "Light", icon: <Sun className="size-4" aria-hidden /> },
    { value: "dark", label: "Dark", icon: <Moon className="size-4" aria-hidden /> },
    { value: "system", label: "System", icon: <MonitorSmartphone className="size-4" aria-hidden /> },
  ];

  return (
    <div role="radiogroup" aria-label="Appearance" className="inline-flex rounded-[10px] border border-rule bg-surface p-0.5">
      {options.map((o) => {
        const active = pref === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={o.label}
            onClick={() => {
              setPref(o.value);
              applyTheme(o.value);
            }}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors ${
              active ? "bg-ink text-paper" : "text-ink-soft hover:bg-surface-2 hover:text-ink"
            }`}
          >
            {o.icon}
            {!compact && <span>{o.label}</span>}
            {compact && <span className="sr-only">{o.label}</span>}
          </button>
        );
      })}
    </div>
  );
}
