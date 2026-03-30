"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { TlsResult } from "@/shared/types/scan";
import { TlsGradeCard } from "@/components/scan/details/tls/tls-grade-card";
import { TlsProtocolTable } from "@/components/scan/details/tls/tls-protocol-table";
import { TlsCipherStatsCard } from "@/components/scan/details/tls/tls-cipher-stats";
import { TlsCipherTable } from "@/components/scan/details/tls/tls-cipher-table";
import { TlsCurvesSection } from "@/components/scan/details/tls/tls-curves-section";
import { TlsConfigTable } from "@/components/scan/details/tls/tls-config-table";

interface TlsDetailProps {
  data: TlsResult | null;
  isLoading?: boolean;
}

export function TlsDetail({ data, isLoading }: TlsDetailProps) {
  if (isLoading) {
    return <TlsDetailSkeleton />;
  }

  if (!data || (data.protocols?.length === 0 && data.cipherSuites?.length === 0)) {
    return (
      <Card>
        <CardContent className="py-6">
          <p className="text-sm text-muted-foreground">
            No TLS data available.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <TlsGradeCard
        grade={data.grade}
        score={data.score}
        preferredProtocol={data.preferredProtocol}
        cipherStats={data.cipherStats}
      />
      <TlsProtocolTable protocols={data.protocols ?? []} />
      {data.cipherStats && data.cipherStats.total > 0 && (
        <TlsCipherStatsCard stats={data.cipherStats} />
      )}
      <TlsCipherTable
        ciphers={data.cipherSuites ?? []}
        preference={data.cipherPreference ?? undefined}
      />
      {data.curves && data.curves.length > 0 && (
        <TlsCurvesSection curves={data.curves} />
      )}
      {data.config && Object.keys(data.config).length > 0 && (
        <TlsConfigTable config={data.config} />
      )}
    </div>
  );
}

function TlsDetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-48 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
