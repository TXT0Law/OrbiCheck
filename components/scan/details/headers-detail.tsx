import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { HeaderCheck, HeadersResult } from "@/shared/types/scan";

interface HeadersDetailProps {
  data: HeadersResult;
}

function statusBadge(check: HeaderCheck) {
  if (check.status === "pass") {
    return <Badge className="border-transparent bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-200">Pass</Badge>;
  }

  if (check.status === "fail") {
    return <Badge className="border-transparent bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200">Fail</Badge>;
  }

  return <Badge className="border-transparent bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-200">Missing</Badge>;
}

export function HeadersDetail({ data }: HeadersDetailProps) {
  const securityChecks = Array.isArray(data.securityChecks) ? data.securityChecks : [];
  const responseHeaders =
    data.responseHeaders && typeof data.responseHeaders === "object"
      ? data.responseHeaders
      : ({} as Record<string, string>);

  return (
    <div className="space-y-6">
      <Card id="http-security" className="scroll-mt-24">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-lg font-semibold">Security Headers Checklist</CardTitle>
          <Badge variant="outline">Overall Grade {data.overallGrade ?? "—"}</Badge>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <caption className="sr-only">Security headers checklist</caption>
            <TableHeader>
              <TableRow>
                <TableHead>Header</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Recommendation</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {securityChecks.map((check) => (
                <TableRow key={check.name}>
                  <TableCell className="font-medium">{check.name}</TableCell>
                  <TableCell>{statusBadge(check)}</TableCell>
                  <TableCell className="text-zinc-600 dark:text-zinc-300">{check.value ?? "-"}</TableCell>
                  <TableCell className="text-muted-foreground">{check.recommendation ?? "-"}</TableCell>
                </TableRow>
              ))}
              {securityChecks.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                    No security header checks available.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Raw Response Headers</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-2">
            {Object.entries(responseHeaders).map(([name, value]) => (
              <div key={name} className="flex flex-wrap justify-between rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800">
                <span className="font-medium text-zinc-700 dark:text-zinc-300">{name}</span>
                <span className="text-muted-foreground">{value}</span>
              </div>
            ))}
            {Object.keys(responseHeaders).length === 0 && (
              <p className="text-sm text-muted-foreground">No response headers captured.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
