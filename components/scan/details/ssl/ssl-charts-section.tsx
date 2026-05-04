"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CertValidityProgress } from "@/components/scan/charts/cert-validity-progress";
import { CipherStrengthChart } from "@/components/scan/charts/cipher-strength-chart";
import { ProtocolSupportChart } from "@/components/scan/charts/protocol-support-chart";
import type { SslCheckResult } from "@/shared/types/scan";

interface SslChartsSectionProps {
  data: SslCheckResult;
}

/**
 * Visual companions to the SSL detail tables: certificate validity bar,
 * protocol support matrix, and cipher strength donut. Each child chart owns
 * its empty state, so this section only handles layout + section titles.
 */
export function SslChartsSection({ data }: SslChartsSectionProps) {
  const protocols = data.protocols ?? [];
  const ciphers = data.cipherSuites ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Visual Snapshot</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <section aria-labelledby="ssl-cert-validity-heading">
          <h3
            id="ssl-cert-validity-heading"
            className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-200"
          >
            Certificate Validity
          </h3>
          <CertValidityProgress daysRemaining={data.daysRemaining} />
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section aria-labelledby="ssl-protocol-matrix-heading">
            <h3
              id="ssl-protocol-matrix-heading"
              className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-200"
            >
              Protocol Support Matrix
            </h3>
            <ProtocolSupportChart data={protocols} />
          </section>

          <section aria-labelledby="ssl-cipher-strength-heading">
            <h3
              id="ssl-cipher-strength-heading"
              className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-200"
            >
              Cipher Strength Distribution
            </h3>
            <CipherStrengthChart data={ciphers} />
          </section>
        </div>
      </CardContent>
    </Card>
  );
}
