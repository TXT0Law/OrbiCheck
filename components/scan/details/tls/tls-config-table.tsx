import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle2, XCircle } from "lucide-react";
import type { TlsConfig } from "@/shared/types/scan";

interface TlsConfigTableProps {
  config: TlsConfig;
}

export function TlsConfigTable({ config }: TlsConfigTableProps) {
  const entries: Array<{ key: string; value: string | boolean | string[] | undefined }> = [];

  if (config.secureRenegotiation !== undefined) {
    entries.push({
      key: "Secure Renegotiation",
      value: config.secureRenegotiation,
    });
  }
  if (config.tlsCompression !== undefined) {
    entries.push({
      key: "TLS Compression",
      value: config.tlsCompression,
    });
  }
  if (config.scsv !== undefined) {
    entries.push({
      key: "SCSV Fallback",
      value: config.scsv,
    });
  }
  if (config.alpn !== undefined) {
    entries.push({
      key: "ALPN",
      value: config.alpn,
    });
  }
  if (config.sni !== undefined) {
    entries.push({
      key: "SNI",
      value: config.sni,
    });
  }

  if (entries.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>TLS Configuration</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <caption className="sr-only">TLS configuration flags and negotiated settings</caption>
          <TableHeader>
            <TableRow>
              <TableHead>Setting</TableHead>
              <TableHead>Value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map(({ key, value }) => (
              <TableRow key={key}>
                <TableCell className="font-medium">{key}</TableCell>
                <TableCell>
                  {typeof value === "boolean" ? (
                    (() => {
                      if (key === "TLS Compression") {
                        const ok = !value;
                        return (
                          <span className="flex items-center gap-1">
                            {ok ? (
                              <CheckCircle2
                                className="h-4 w-4 text-green-600 dark:text-green-400"
                                aria-hidden="true"
                              />
                            ) : (
                              <XCircle
                                className="h-4 w-4 text-red-600 dark:text-red-400"
                                aria-hidden="true"
                              />
                            )}
                            {ok ? "Disabled" : "Enabled"}
                          </span>
                        );
                      }
                      return (
                        <span className="flex items-center gap-1">
                          {value ? (
                            <CheckCircle2
                              className="h-4 w-4 text-green-600 dark:text-green-400"
                              aria-hidden="true"
                            />
                          ) : (
                            <XCircle
                              className="h-4 w-4 text-red-600 dark:text-red-400"
                              aria-hidden="true"
                            />
                          )}
                          {value ? "Enabled" : "Disabled"}
                        </span>
                      );
                    })()
                  ) : Array.isArray(value) ? (
                    <div className="flex flex-wrap gap-1">
                      {value.map((v, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {v}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    String(value ?? "—")
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
