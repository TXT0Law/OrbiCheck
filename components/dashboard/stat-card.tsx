import Link from "next/link";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  href: string;
  trend?: { value: string; positive: boolean };
  iconBgColor?: string;
  loading?: boolean;
}

export function StatCard({
  icon,
  label,
  value,
  href,
  trend,
  iconBgColor = "bg-zinc-100 text-zinc-700",
  loading = false,
}: StatCardProps) {
  const trendIsStable = trend?.value.toLowerCase() === "stable";

  if (loading) {
    return (
      <Card className="shadow-sm">
        <CardContent className="space-y-6 p-5">
          <div className="flex items-start justify-between">
            <Skeleton className="h-10 w-10 rounded-full" />
            <Skeleton className="h-4 w-12" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-4 w-24" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Link href={href}>
      <Card className="cursor-pointer shadow-sm transition-shadow hover:shadow-md">
        <CardContent className="space-y-6 p-5">
          <div className="flex items-start justify-between">
            <div className={`flex h-10 w-10 items-center justify-center rounded-full ${iconBgColor}`}>{icon}</div>

            {trend ? (
              <div
                className={`inline-flex items-center gap-1 text-xs font-medium ${
                  trendIsStable ? "text-muted-foreground" : trend.positive ? "text-green-600" : "text-red-600"
                }`}
              >
                {!trendIsStable && (trend.positive ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />)}
                {trend.value}
              </div>
            ) : null}
          </div>

          <div>
            <p className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">{value}</p>
            <p className="text-sm text-muted-foreground">{label}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
