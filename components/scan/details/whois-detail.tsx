import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { WhoisResult } from "@/shared/types/scan";

interface WhoisDetailProps {
  data: WhoisResult | null | undefined;
}

export function WhoisDetail({ data }: WhoisDetailProps) {
  if (!data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">WHOIS</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">WHOIS data is unavailable for this scan.</CardContent>
      </Card>
    );
  }

  const nameservers = Array.isArray(data.nameservers) ? data.nameservers : [];
  const domainStatus = Array.isArray(data.domainStatus) ? data.domainStatus : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">WHOIS</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Field</TableHead>
              <TableHead>Value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="font-medium">Registrar</TableCell>
              <TableCell>{data.registrar || "—"}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">Created</TableCell>
              <TableCell>{data.createdAt || "—"}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">Updated</TableCell>
              <TableCell>{data.updatedAt || "—"}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">Expires</TableCell>
              <TableCell>{data.expiresAt || "—"}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">Nameservers</TableCell>
              <TableCell>{nameservers.join(", ") || "-"}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">Domain Status</TableCell>
              <TableCell>{domainStatus.join(", ") || "-"}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
