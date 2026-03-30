import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SslCheckResult } from "@/shared/types/scan";

import { StatusBadge } from "./ssl-shared";

export function SslSanSection({ data }: { data: SslCheckResult }) {
  const sans = data.sans ?? [];
  if (sans.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-4">
          <span>Subject Alternative Names ({sans.length})</span>
          {data.cnMatchesSan !== undefined && (
            <StatusBadge
              ok={data.cnMatchesSan}
              labelOk="CN in SAN"
              labelFail="CN not in SAN"
            />
          )}
          {data.wildcardScope && (
            <Badge variant="secondary">Wildcard: {data.wildcardScope}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {sans.map((san, i) => (
            <Badge
              key={`${san}-${i}`}
              variant={san.startsWith("*.") ? "secondary" : "outline"}
              className="font-mono text-xs"
            >
              {san}
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
