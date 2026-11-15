/* Adsvio wordmark. Uses the real logo assets; the dot stays colored. */
export function Wordmark({ className = "", height = 28 }: { className?: string; height?: number }) {
  const width = Math.round((420 / 97) * height);
  return (
    <span className={`inline-flex items-center ${className}`} aria-label="Adsvio">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/logo-adsvio.png" width={width} height={height} alt="Adsvio" className="block dark-hidden" data-variant="dark" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/logo-adsvio-light.png" width={width} height={height} alt="" aria-hidden className="light-hidden" data-variant="light" />
      <style>{`
        :root[data-theme="dark"] img[data-variant="dark"]{display:none}
        :root:not([data-theme="dark"]) img[data-variant="light"]{display:none}
      `}</style>
    </span>
  );
}

/** Text wordmark for compact places (nav); keeps the mango period. */
export function WordmarkText({ className = "" }: { className?: string }) {
  return (
    <span className={`font-display font-extrabold tracking-[-0.03em] ${className}`}>
      Adsvio<span className="text-mango">.</span>
    </span>
  );
}
