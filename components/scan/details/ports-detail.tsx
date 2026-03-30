import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { PortResult } from "@/shared/types/scan";

interface PortsDetailProps {
  data: PortResult[] | null | undefined;
}

function getStateBadge(state: PortResult["state"]) {
  if (state === "open") {
    return <Badge className="border-transparent bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200">Open</Badge>;
  }

  if (state === "filtered") {
    return <Badge className="border-transparent bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-200">Filtered</Badge>;
  }

  return <Badge className="border-transparent bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-200">Closed</Badge>;
}

export function PortsDetail({ data }: PortsDetailProps) {
  if (!Array.isArray(data)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Open Port Scan</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">Port scan data is unavailable for this scan.</CardContent>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Open Port Scan</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">No open or closed ports were returned.</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Open Port Scan</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Port</TableHead>
              <TableHead>Protocol</TableHead>
              <TableHead>Service</TableHead>
              <TableHead>State</TableHead>
              <TableHead>Banner</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((port) => (
              <TableRow key={`${port.protocol}-${port.port}`}>
                <TableCell className="font-medium">{port.port}</TableCell>
                <TableCell className="uppercase">{port.protocol}</TableCell>
                <TableCell>{port.service}</TableCell>
                <TableCell>{getStateBadge(port.state)}</TableCell>
                <TableCell className="text-muted-foreground">{port.banner}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
