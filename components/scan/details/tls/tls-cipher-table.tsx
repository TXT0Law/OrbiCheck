import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle2, XCircle } from "lucide-react";
import type { CipherInfo } from "@/shared/types/scan";

interface TlsCipherTableProps {
  ciphers: CipherInfo[];
  preference?: "server" | "client" | null;
}

const STRENGTH_BADGE: Record<string, string> = {
  strong: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-200",
  acceptable: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200",
  weak: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-200",
  insecure: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200",
};

export function TlsCipherTable({ ciphers, preference }: TlsCipherTableProps) {
  if (!ciphers || ciphers.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Cipher Suites</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No cipher suite data available.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Cipher Suites</CardTitle>
        {preference && (
          <Badge variant="outline" className="text-xs">
            Preference: {preference}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <caption className="sr-only">TLS cipher suites offered by the server</caption>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Protocol</TableHead>
              <TableHead>Strength</TableHead>
              <TableHead className="hidden md:table-cell">Key Ex</TableHead>
              <TableHead className="hidden lg:table-cell">Auth</TableHead>
              <TableHead className="hidden lg:table-cell">Encryption</TableHead>
              <TableHead className="w-16">FS</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ciphers.map((cipher, idx) => (
              <TableRow key={`${cipher.name}-${idx}`}>
                <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                <TableCell className="font-mono text-xs">{cipher.name}</TableCell>
                <TableCell>{cipher.protocol}</TableCell>
                <TableCell>
                  <Badge
                    variant="secondary"
                    className={`border-transparent ${STRENGTH_BADGE[cipher.strength] ?? "bg-zinc-100 dark:bg-zinc-800"}`}
                  >
                    {cipher.strength}
                  </Badge>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {cipher.keyExchange ?? "—"}
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  {cipher.auth ?? "—"}
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  {cipher.encryption ?? "—"}
                </TableCell>
                <TableCell>
                  {cipher.forwardSecrecy ? (
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
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
