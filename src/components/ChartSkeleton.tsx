export function ChartSkeleton({ height = 400, className = '' }: { height?: number; className?: string }) {
  return (
    <div
      className={`rounded-xl skeleton-shimmer w-full ${className}`}
      style={{ height, backgroundColor: 'var(--bg-root)', border: '1px solid var(--border-subtle)' }}
      aria-hidden
    />
  );
}
