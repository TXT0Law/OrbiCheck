import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle2, XCircle } from "lucide-react";
import type { ProtocolInfo } from "@/shared/types/scan";

interface TlsProtocolTableProps {
  protocols: ProtocolInfo[];
}

const SECURE_BADGE_CONFIG: Record<string, string> = {
  good: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-200",
  warning: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-200",
  danger: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200",
};

export function TlsProtocolTable({ protocols }: TlsProtocolTableProps) {
  if (!protocols || protocols.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Protocol Support</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No protocol data available.
          </p>
        </CardContent>
      </Card>
    );
  }

  const secureLabel: Record<string, string> = {
    good: "Good",
    warning: "Warning",
    danger: "Danger",
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Protocol Support</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <caption className="sr-only">Supported TLS protocol versions</caption>
          <TableHeader>
            <TableRow>
              <TableHead>Protocol</TableHead>
              <TableHead>Supported</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {protocols.map((protocol) => (
              <TableRow key={protocol.name}>
                <TableCell className="font-medium">{protocol.name}</TableCell>
                <TableCell>
                  {protocol.supported ? (
                    <>
                      <CheckCircle2
                        className="h-4 w-4 text-green-600 dark:text-green-400"
                        aria-hidden="true"
                      />
                      <span className="sr-only">Yes</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-4 w-4 text-zinc-400" aria-hidden="true" />
                      <span className="sr-only">No</span>
                    </>
                  )}
                </TableCell>
                <TableCell>
                  <Badge
                    variant="secondary"
                    className={`border-transparent ${SECURE_BADGE_CONFIG[protocol.secure] ?? "bg-zinc-100 dark:bg-zinc-800"}`}
                  >
                    {secureLabel[protocol.secure] ?? protocol.secure}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
