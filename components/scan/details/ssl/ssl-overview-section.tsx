import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SslCheckResult } from "@/shared/types/scan";

import { formatDate, GradeBadge, InfoItem } from "./ssl-shared";

export function SslOverviewSection({ data }: { data: SslCheckResult }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>SSL Certificate Overview</span>
          <GradeBadge grade={data.grade} />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <InfoItem label="Subject" value={data.subject} />
          <InfoItem label="Issuer" value={data.issuer} />
          <InfoItem label="Certificate Type" value={data.certType ?? "N/A"} />
          <InfoItem label="Valid From" value={formatDate(data.validFrom)} />
          <InfoItem label="Expires" value={formatDate(data.validTo)} />
          {data.renewed && (
            <InfoItem label="Renewed" value={formatDate(data.renewed)} />
          )}
          <InfoItem
            label="Days Remaining"
            value={data.daysRemaining != null ? String(data.daysRemaining) : "—"}
            variant={data.daysRemaining != null && data.daysRemaining < 30 ? "warning" : "default"}
          />
          <InfoItem label="Key Size" value={`${data.keySize} bits`} />
          <InfoItem label="Signature Algorithm" value={data.signatureAlgorithm ?? "N/A"} />
          {data.asn1Curve && (
            <InfoItem label="ASN1 Curve" value={data.asn1Curve} />
          )}
          {data.nistCurve && (
            <InfoItem label="NIST Curve" value={data.nistCurve} />
          )}
          {data.serialNumber && (
            <InfoItem label="Serial Num" value={data.serialNumber} wrap />
          )}
          {data.fingerprint && (
            <InfoItem label="Fingerprint" value={data.fingerprint} wrap />
          )}
          {data.extensions?.extendedKeyUsage && data.extensions.extendedKeyUsage.length > 0 && (
            <InfoItem
              label="Extended Key Usage"
              value={data.extensions.extendedKeyUsage.join(", ")}
              wrap
            />
          )}
          <InfoItem
            label="Chain Depth"
            value={data.chainDepth != null ? String(data.chainDepth) : "—"}
          />
        </div>
      </CardContent>
    </Card>
  );
}
