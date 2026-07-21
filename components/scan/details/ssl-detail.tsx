"use client";

import dynamic from "next/dynamic";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SslCheckResult } from "@/shared/types/scan";

import { SslCertificateChainSection } from "./ssl/ssl-certificate-chain-section";
import { SslCipherSummaryCard, SslProtocolSummaryCard } from "./ssl/ssl-protocol-cipher-cards";
import {
  SslDnsCaaSection,
  SslExtensionsSection,
  SslHstsSummaryCard,
  SslServerConfigSection,
} from "./ssl/ssl-hsts-extensions-caa-server";
import { SslOverviewSection } from "./ssl/ssl-overview-section";
import { SslSanSection } from "./ssl/ssl-san-section";
import {
  SslRevocationSection,
  SslVulnerabilitySection,
} from "./ssl/ssl-vulnerability-revocation";

export { formatDate } from "./ssl/ssl-shared";

const SslChartsSection = dynamic(
  () =>
    import("./ssl/ssl-charts-section").then(
      (module) => module.SslChartsSection,
    ),
  {
    loading: () => (
      <p className="text-sm text-muted-foreground" role="status">
        Loading SSL charts…
      </p>
    ),
    ssr: false,
  },
);

interface SslDetailProps {
  data: SslCheckResult | null;
  /** Required for correct "View Full Details" links to tls/hsts pages */
  scanId?: string;
}

export function SslDetail({ data, scanId }: SslDetailProps) {
  if (!data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">SSL Certificate Details</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            SSL module data is unavailable for this scan.
          </p>
        </CardContent>
      </Card>
    );
  }

  const basePath = scanId ? `/dashboard/scan/${scanId}` : undefined;

  return (
    <div className="space-y-6">
      <SslOverviewSection data={data} />
      <SslChartsSection data={data} />
      <SslCertificateChainSection data={data} />
      <SslSanSection data={data} />
      <SslProtocolSummaryCard protocols={data.protocols ?? []} basePath={basePath} />
      <SslCipherSummaryCard
        ciphers={data.cipherSuites ?? []}
        forwardSecrecy={data.forwardSecrecy}
        basePath={basePath}
      />
      <SslVulnerabilitySection vulnerabilities={data.vulnerabilities ?? []} />
      <SslRevocationSection revocation={data.revocation} />
      <SslHstsSummaryCard hsts={data.hsts} basePath={basePath} />
      <SslExtensionsSection extensions={data.extensions} />
      <SslDnsCaaSection caa={data.caa} />
      <SslServerConfigSection
        secureRenegotiation={data.secureRenegotiation}
        tlsCompression={data.tlsCompression}
        ct={data.ct}
      />
    </div>
  );
}
