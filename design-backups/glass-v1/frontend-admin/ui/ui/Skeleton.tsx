/** Skeleton — shimmer placeholder block. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={`shimmer rounded-[var(--r-md)] ${className ?? ""}`} />;
}
