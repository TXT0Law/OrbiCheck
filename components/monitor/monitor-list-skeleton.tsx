import { Skeleton } from "@/components/ui/skeleton";

export function MonitorListTableSkeleton() {
  return (
    <div className="space-y-3 rounded-md border border-zinc-200 p-4 dark:border-zinc-800">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-20" />
        </div>
      ))}
    </div>
  );
}
