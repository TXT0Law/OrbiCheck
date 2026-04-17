import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { TracerouteResult } from "@/shared/types/scan";

interface TracerouteDetailProps {
  data: TracerouteResult | null | undefined;
}

export function TracerouteDetail({ data }: TracerouteDetailProps) {
  if (!data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Traceroute Path</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">Traceroute data is unavailable for this scan.</CardContent>
      </Card>
    );
  }

  const hops = Array.isArray(data.hops) ? data.hops : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Traceroute Path</CardTitle>
        <p className="text-sm text-muted-foreground">
          Total hops: {data.totalHops ?? hops.length} · Destination reached: {data.destinationReached ? "Yes" : "No"}
        </p>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {hops.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hops were returned by traceroute.</p>
        ) : null}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Hop #</TableHead>
              <TableHead>IP</TableHead>
              <TableHead>Hostname</TableHead>
              <TableHead>RTT (ms)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {hops.map((hop, index) => {
              const isDestination = data.destinationReached && index === hops.length - 1;

              return (
                <TableRow key={`${hop.hop}-${hop.ip}`} className={isDestination ? "bg-green-50/70 dark:bg-green-900/20" : ""}>
                  <TableCell className="font-semibold">{hop.hop}</TableCell>
                  <TableCell>{hop.ip}</TableCell>
                  <TableCell className="max-w-[24rem] break-all">
                    {hop.hostname ?? <span className="text-muted-foreground">*</span>}
                  </TableCell>
                  <TableCell>
                    {(typeof hop.rttMs === "number" ? hop.rttMs : 0).toFixed(1)}ms
                    {isDestination ? (
                      <Badge className="ml-2 border-transparent bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-200">
                        Destination
                      </Badge>
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
