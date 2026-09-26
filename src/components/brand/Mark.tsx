/**
 * The Whodunnit mark: the loop of a fingerprint drawn as three open ink
 * strokes, broken where a pen would lift. Authorship, not detective kitsch.
 */
export function Mark({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M6.2 18.4C4.8 16.9 4 14.9 4 12.6 4 8 7.6 4.4 12 4.4c3.4 0 6.3 2.1 7.4 5.1" />
      <path d="M8.3 19.4c-1.2-1.6-1.9-3.5-1.9-5.6 0-3.3 2.5-5.9 5.6-5.9 2.6 0 4.8 1.8 5.4 4.3" />
      <path d="M11 20c-.7-1.4-1.1-3-1.1-4.7 0-1.7 1-3.1 2.4-3.1 1.3 0 2.3 1.2 2.3 2.9 0 1.9.6 3.7 1.6 5.1" />
      <path d="M19.8 13.4c.1 2.1-.4 4.1-1.4 5.8" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 text-ink ${className ?? ""}`}>
      <Mark size={22} className="text-accent" />
      <span className="font-serif text-[1.35rem] leading-none tracking-[-0.01em]">
        Whodunnit
      </span>
    </span>
  );
}
