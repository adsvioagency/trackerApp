"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Keyboard shortcuts: "/" opens search, "g t" Today, "g c" Calendar, "n" Add. */
export function Hotkeys() {
  const router = useRouter();
  useEffect(() => {
    let pendingG = false;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "/") {
        e.preventDefault();
        router.push("/search");
        return;
      }
      if (e.key === "g") {
        pendingG = true;
        setTimeout(() => (pendingG = false), 800);
        return;
      }
      if (pendingG) {
        const map: Record<string, string> = { t: "/today", c: "/calendar", m: "/money", k: "/tasks", n: "/notes", p: "/projects", l: "/clients", a: "/assistant" };
        if (map[e.key]) {
          e.preventDefault();
          router.push(map[e.key]);
        }
        pendingG = false;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);
  return null;
}
