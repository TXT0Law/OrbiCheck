import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { HeaderStatusChart } from "@/components/scan/charts/header-status-chart";
import type { HeaderCheck, HeadersResult } from "@/shared/types/scan";

interface HeadersDetailProps {
  data: HeadersResult;
}

const GRADE_COLOR_CLASSES: Record<HeadersResult["overallGrade"], string> = {
  A: "bg-green-500 text-white",
  B: "bg-yellow-400 text-zinc-900",
  C: "bg-orange-400 text-white",
  D: "bg-red-400 text-white",
  F: "bg-red-600 text-white",
};

const NEUTRAL_GRADE_CLASS =
  "bg-zinc-500/20 text-zinc-600 dark:bg-zinc-500/25 dark:text-zinc-300";

function HeadersGradeBadge({ grade }: { grade?: HeadersResult["overallGrade"] | null }) {
  const value = grade && grade in GRADE_COLOR_CLASSES ? grade : null;
  const colorClass = value ? GRADE_COLOR_CLASSES[value] : NEUTRAL_GRADE_CLASS;
  const label = value ?? "—";
  return (
    <span
      className={`inline-flex h-12 min-w-12 items-center justify-center rounded-lg px-2 text-2xl font-bold ${colorClass}`}
      aria-label={`Overall security headers grade ${label}`}
    >
      {label}
    </span>
  );
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

  const passCount = securityChecks.filter((check) => check.status === "pass").length;
  const failCount = securityChecks.filter((check) => check.status === "fail").length;
  const missingCount = securityChecks.filter((check) => check.status === "missing").length;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Security Headers Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 items-center gap-6 md:grid-cols-[auto_1fr]">
            <div className="flex flex-col items-center gap-2">
              <HeadersGradeBadge grade={data.overallGrade} />
              <p className="text-xs text-muted-foreground">Overall grade</p>
              <div className="flex flex-wrap justify-center gap-2 text-xs">
                <Badge
                  variant="outline"
                  className="border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-300"
                >
                  {passCount} pass
                </Badge>
                <Badge
                  variant="outline"
                  className="border-red-300 text-red-700 dark:border-red-700 dark:text-red-300"
                >
                  {failCount} fail
                </Badge>
                <Badge
                  variant="outline"
                  className="border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300"
                >
                  {missingCount} missing
                </Badge>
              </div>
            </div>
            <HeaderStatusChart data={securityChecks} />
          </div>
        </CardContent>
      </Card>

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
                  <TableCell className="max-w-[28rem] break-all text-zinc-600 dark:text-zinc-300">
                    {check.value ?? "-"}
                  </TableCell>
                  <TableCell className="max-w-[36rem] whitespace-normal break-words text-muted-foreground">
                    {check.recommendation ?? "-"}
                  </TableCell>
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
              <div
                key={name}
                className="flex flex-wrap items-baseline justify-between gap-2 rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800"
              >
                <span className="shrink-0 font-medium text-zinc-700 dark:text-zinc-300">{name}</span>
                <span className="min-w-0 max-w-full break-all text-right text-muted-foreground">{value}</span>
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
