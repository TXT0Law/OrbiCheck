import { Skeleton } from "@/components/ui/skeleton";

export function MonitorSslSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-6 w-36" />
      <Skeleton className="h-40 w-full rounded-lg" />
      <Skeleton className="h-56 w-full rounded-lg" />
      <Skeleton className="h-64 w-full rounded-lg" />
      <Skeleton className="h-16 w-full rounded-lg" />
    </div>
  );
}
