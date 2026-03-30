import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AssociatedHost, AssociatedHostsResult } from "@/shared/types/scan";

interface AssociatedHostsDetailProps {
  data: AssociatedHostsResult;
}

function getSourceBadgeClass(source: AssociatedHost["source"]) {
  if (source === "reverse-dns") {
    return "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200";
  }

  if (source === "certificate") {
    return "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-200";
  }

  if (source === "same-ip") {
    return "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-200";
  }

  return "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
}

export function AssociatedHostsDetail({ data }: AssociatedHostsDetailProps) {
  const domain = data.domain ?? "";
  const totalFound = data.totalFound ?? data.hosts?.length ?? 0;
  const hosts = data.hosts ?? [];

  if (hosts.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Associated Hosts</CardTitle>
          <p className="text-sm text-muted-foreground">
            No associated hosts discovered for this domain{domain ? ` (${domain})` : ""}.
          </p>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Associated Hosts</CardTitle>
        <p className="text-sm text-muted-foreground">
          Found {totalFound} associated hosts{domain ? ` for ${domain}` : ""}
        </p>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Hostname</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>IP</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {hosts.map((host) => (
              <TableRow key={`${host.hostname}-${host.source}`}>
                <TableCell className="font-medium">{host.hostname}</TableCell>
                <TableCell>
                  <Badge className={`border-transparent ${getSourceBadgeClass(host.source)}`}>{host.source}</Badge>
                </TableCell>
                <TableCell>{host.ip ?? "-"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
