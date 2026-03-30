import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TlsCipherStats } from "@/shared/types/scan";

interface TlsCipherStatsProps {
  stats: TlsCipherStats;
}

export function TlsCipherStatsCard({ stats }: TlsCipherStatsProps) {
  const weakHighlight = stats.weakCount > 0 ? "text-red-600 dark:text-red-400" : "";
  const fsHighlight =
    stats.forwardSecrecyPercent < 100 ? "text-yellow-600 dark:text-yellow-400" : "";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cipher Suite Statistics</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <p className="text-xs text-muted-foreground">Total Ciphers</p>
            <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
              {stats.total}
            </p>
          </div>
          <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <p className="text-xs text-muted-foreground">Weak Count</p>
            <p className={`text-2xl font-bold ${weakHighlight || "text-zinc-900 dark:text-zinc-100"}`}>
              {stats.weakCount}
            </p>
          </div>
          <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <p className="text-xs text-muted-foreground">Forward Secrecy %</p>
            <p className={`text-2xl font-bold ${fsHighlight || "text-zinc-900 dark:text-zinc-100"}`}>
              {stats.forwardSecrecyPercent}%
            </p>
          </div>
          <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <p className="text-xs text-muted-foreground">AEAD %</p>
            <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
              {stats.aeadPercent}%
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
