import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RedirectsResult } from "@/shared/types/scan";

interface RedirectsDetailProps {
  data: RedirectsResult | null | undefined;
}

function getStatusCodeClass(statusCode: number) {
  if (statusCode === 200) {
    return "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-200";
  }

  if (statusCode === 301 || statusCode === 302) {
    return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-200";
  }

  if (statusCode >= 400) {
    return "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200";
  }

  return "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
}

export function RedirectsDetail({ data }: RedirectsDetailProps) {
  if (!data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Redirect Chain</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">Redirect data is unavailable for this scan.</CardContent>
      </Card>
    );
  }

  const hops = Array.isArray(data.hops) ? data.hops : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Redirect Chain</CardTitle>
        <p className="break-all text-sm text-muted-foreground">
          Total redirects: {data.totalRedirects ?? Math.max(hops.length - 1, 0)} · Final URL: {data.finalUrl || "-"}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {hops.length === 0 ? <p className="text-sm text-muted-foreground">No redirects were detected.</p> : null}
        {hops.map((hop, index) => {
          const isLast = index === hops.length - 1;

          return (
            <div key={`${hop.url}-${index}`} className={isLast ? "pl-6" : "ml-2 border-l-2 border-zinc-200 pl-4 dark:border-zinc-800"}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p
                  className="min-w-0 max-w-full break-all text-sm font-semibold text-zinc-900 dark:text-zinc-100"
                  title={hop.url}
                >
                  {hop.url}
                </p>
                <Badge className={`border-transparent ${getStatusCodeClass(hop.statusCode)}`}>{hop.statusCode}</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{hop.responseTimeMs}ms</p>
              {isLast ? <p className="mt-1 text-xs font-medium text-green-600 dark:text-green-400">Final Destination</p> : null}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
