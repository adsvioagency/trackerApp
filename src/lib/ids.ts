/** Short random ids for items inside JSON columns (checklists, document lines). */
export function shortId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}
