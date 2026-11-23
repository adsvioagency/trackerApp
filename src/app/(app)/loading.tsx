export default function LoadingTrackerPage() {
  return (
    <div className="py-6" role="status">
      <span className="text-sm font-semibold text-ink-muted">Loading…</span>
      <div aria-hidden="true" className="mt-4 h-24 rounded-xl bg-surface-2 motion-safe:animate-pulse" />
    </div>
  );
}
