type BrandMarkProps = { compact?: boolean; className?: string };

export function BrandMark({ compact = false, className = "" }: BrandMarkProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      width={compact ? 34 : 42}
      height={compact ? 34 : 42}
      viewBox="0 0 44 44"
      fill="none"
    >
      <rect x="3.5" y="3.5" width="37" height="37" rx="11" stroke="#A9CDBE" strokeOpacity=".65" />
      <path d="M25.7 13H18.3a5.3 5.3 0 0 0-5.3 5.3v7.4a5.3 5.3 0 0 0 5.3 5.3h2.4" stroke="#A9CDBE" strokeWidth="2.3" strokeLinecap="round" />
      <path d="M30.5 13h-5.7a5.3 5.3 0 0 0-5.3 5.3v7.4a5.3 5.3 0 0 0 5.3 5.3h6.7" stroke="#F2B53A" strokeWidth="2.3" strokeLinecap="round" />
      <circle cx="32.3" cy="30.9" r="1.7" fill="#F2B53A" />
    </svg>
  );
}
