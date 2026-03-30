import { Skeleton } from "@/components/ui/skeleton";

/**
 * Structural skeleton for monitor detail shell (~260px SubNav + header + content).
 */
export function MonitorDetailProviderSkeleton() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="fixed inset-y-0 left-0 z-30 hidden w-[260px] border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950 md:block">
        <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="space-y-2 p-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full rounded-md" />
          ))}
        </div>
      </div>

      <div className="md:pl-[260px]">
        <div className="space-y-6 p-4 md:p-8">
          <div className="flex items-start justify-between border-b border-zinc-200 pb-4 dark:border-zinc-800">
            <div className="space-y-2">
              <Skeleton className="h-7 w-48" />
              <Skeleton className="h-4 w-72 max-w-full" />
              <div className="flex flex-wrap gap-1.5 pt-1">
                <Skeleton className="h-5 w-14 rounded-full" />
                <Skeleton className="h-5 w-14 rounded-full" />
                <Skeleton className="h-5 w-14 rounded-full" />
              </div>
            </div>
            <Skeleton className="h-10 w-10 rounded-md" />
          </div>

          <div className="space-y-6">
            <Skeleton className="h-5 w-32" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-32 rounded-lg" />
              ))}
            </div>
            <Skeleton className="h-64 w-full rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  );
}
