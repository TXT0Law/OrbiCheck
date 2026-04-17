import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SummaryCard } from "@/components/scan/details/summary-card";
import type { SslCheckResult } from "@/shared/types/scan";

import { formatExtensionName, formatMaxAge, StatusBadge } from "./ssl-shared";

export function SslHstsSummaryCard({
  hsts,
  basePath,
}: {
  hsts?: SslCheckResult["hsts"];
  basePath?: string;
}) {
  if (!hsts) {
    return (
      <SummaryCard
        title="HSTS"
        status="info"
        summaryLines={["HSTS data not available. View HSTS page for full check."]}
        detailLink={basePath ? `${basePath}/hsts` : "../hsts"}
        detailLinkText="View Full Details"
      />
    );
  }

  const status: "pass" | "warn" | "fail" | "info" = hsts.enabled
    ? hsts.preload
      ? "pass"
      : "warn"
    : "fail";

  const summaryLines: string[] = hsts.enabled
    ? [
        hsts.preload ? "Enabled with Preload" : "Enabled",
        hsts.maxAge !== undefined
          ? `Max-Age: ${hsts.maxAge} (${formatMaxAge(hsts.maxAge)})`
          : "",
        hsts.includeSubDomains !== undefined
          ? `includeSubDomains: ${hsts.includeSubDomains ? "on" : "off"}`
          : "",
      ].filter(Boolean)
    : ["Not enabled"];

  return (
    <SummaryCard
      title="HSTS"
      status={status}
      summaryLines={summaryLines}
      detailLink={basePath ? `${basePath}/hsts` : "../hsts"}
      detailLinkText="View Full Details"
    />
  );
}

export function SslExtensionsSection({
  extensions,
}: {
  extensions?: SslCheckResult["extensions"];
}) {
  if (!extensions) {
    return null;
  }

  const entries = Object.entries(extensions).filter(
    ([, v]) => v !== undefined && v !== null
  );

  if (entries.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Certificate Extensions</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Extension</TableHead>
              <TableHead>Value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map(([key, value]) => (
              <TableRow key={key}>
                <TableCell className="font-medium">
                  {formatExtensionName(key)}
                </TableCell>
                <TableCell className="max-w-[28rem] break-all font-mono text-xs">
                  {Array.isArray(value)
                    ? value.join(", ")
                    : typeof value === "object"
                      ? JSON.stringify(value)
                      : String(value)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export function SslDnsCaaSection({ caa }: { caa?: string[] }) {
  const hasRecords = caa && caa.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>DNS CAA Records</CardTitle>
      </CardHeader>
      <CardContent>
        {hasRecords ? (
          <div className="space-y-1">
            {(caa ?? []).map((record, i) => (
              <p key={i} className="break-all font-mono text-sm">
                {record}
              </p>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No CAA records were attached to this SSL summary. For authoritative DNS data, open the
            DNS module — absence here can mean the scan did not merge CAA or the zone has no CAA.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function SslServerConfigSection({
  secureRenegotiation,
  tlsCompression,
  ct,
}: {
  secureRenegotiation?: boolean;
  tlsCompression?: boolean;
  ct?: SslCheckResult["ct"];
}) {
  const hasData =
    secureRenegotiation !== undefined ||
    tlsCompression !== undefined ||
    ct !== undefined;

  if (!hasData) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Server Configuration</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-4">
          {secureRenegotiation !== undefined && (
            <StatusBadge
              ok={secureRenegotiation}
              labelOk="Secure Renegotiation"
              labelFail="Insecure Renegotiation"
            />
          )}
          {tlsCompression !== undefined && (
            <StatusBadge
              ok={!tlsCompression}
              labelOk="No TLS Compression"
              labelFail="TLS Compression (CRIME risk)"
            />
          )}
          {ct && (
            <StatusBadge
              ok={ct.hasSct}
              labelOk={`CT: ${ct.logCount ?? "?"} SCTs`}
              labelFail="No Certificate Transparency"
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
