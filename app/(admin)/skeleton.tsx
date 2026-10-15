/** Placeholder shown by each route's loading.tsx while server data loads. */
export function PageSkeleton({ stats = 0, rows = 4 }: { stats?: number; rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading" role="status" className="flex flex-col gap-8">
      <div>
        <div className="skel mb-3 h-3 w-24" />
        <div className="skel h-8 w-2/3 max-w-md" />
        <div className="skel mt-3 h-4 w-full max-w-lg" />
      </div>
      {stats > 0 && (
        <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
          {Array.from({ length: stats }, (_, i) => <div key={i} className="skel h-24" />)}
        </div>
      )}
      <div className="flex flex-col gap-3">
        {Array.from({ length: rows }, (_, i) => <div key={i} className="skel h-14" />)}
      </div>
    </div>
  );
}
