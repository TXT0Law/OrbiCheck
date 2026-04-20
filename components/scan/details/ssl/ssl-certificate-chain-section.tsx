import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SslCheckResult } from "@/shared/types/scan";

import { StatusBadge } from "./ssl-shared";

export function SslCertificateChainSection({ data }: { data: SslCheckResult }) {
  const chainDetails = data.chainDetails;

  if (!chainDetails || chainDetails.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Certificate Chain</CardTitle>
        </CardHeader>
        <CardContent>
          {data.chain && data.chain.length > 0 ? (
            <div className="space-y-2">
              {data.chain.map((cert, i) => (
                <div key={`${cert}-${i}`} className="flex items-start gap-2">
                  <Badge variant="outline" className="shrink-0">{i}</Badge>
                  <span className="min-w-0 break-all text-sm">{cert}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No chain details available
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-4">
          <span>Certificate Chain</span>
          {data.chainComplete !== undefined && (
            <StatusBadge
              ok={data.chainComplete}
              labelOk="Complete"
              labelFail="Incomplete"
            />
          )}
          {data.chainOrderValid !== undefined && (
            <StatusBadge
              ok={data.chainOrderValid}
              labelOk="Order Valid"
              labelFail="Order Invalid"
            />
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">#</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Issuer</TableHead>
              <TableHead className="w-24">Trusted</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {chainDetails.map((cert) => (
              <TableRow key={cert.order}>
                <TableCell>{cert.order}</TableCell>
                <TableCell className="max-w-[28rem] break-all font-mono text-sm">{cert.subject}</TableCell>
                <TableCell className="max-w-[28rem] break-all font-mono text-sm">{cert.issuer}</TableCell>
                <TableCell>
                  {cert.isTrusted === undefined ? (
                    <Badge variant="outline">N/A</Badge>
                  ) : (
                    <StatusBadge
                      ok={cert.isTrusted}
                      labelOk="Yes"
                      labelFail="No"
                    />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
