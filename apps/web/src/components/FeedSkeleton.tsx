const WIDTHS = ['w-3/4', 'w-1/2', 'w-2/3', 'w-5/6'];

interface FeedSkeletonProps {
  /** Read by screen readers instead of the grey bars, e.g. "Loading comments". */
  label: string;
  rows?: number;
}

/** Placeholder rows (avatar + two lines) for feeds and lists that are still loading. */
export function FeedSkeleton({ label, rows = 3 }: FeedSkeletonProps) {
  return (
    <div role="status" className="space-y-4">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          aria-hidden="true"
          className="flex animate-pulse gap-3 motion-reduce:animate-none"
        >
          <span className="h-6 w-6 shrink-0 rounded-full bg-slate-200" />
          <div className="flex-1 space-y-2 pt-1">
            <div className={`h-3 rounded bg-slate-200 ${WIDTHS[index % WIDTHS.length]}`} />
            <div className="h-2.5 w-1/3 rounded bg-slate-100" />
          </div>
        </div>
      ))}
    </div>
  );
}
