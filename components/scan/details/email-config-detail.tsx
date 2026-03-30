import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { EmailConfigResult, MxRecord } from "@/shared/types/scan";

interface EmailConfigDetailProps {
  /** Backend may send a partial object on soft failures; values are normalized for display. */
  data: Partial<EmailConfigResult> | EmailConfigResult;
}

function getStatusClass(status: "pass" | "fail") {
  return status === "pass"
    ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-200"
    : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200";
}

function coercePassFail(value: unknown): "pass" | "fail" {
  return value === "pass" ? "pass" : "fail";
}

function normalizeMxRecords(raw: unknown): MxRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((r) => {
    if (r && typeof r === "object") {
      const o = r as { priority?: unknown; host?: unknown };
      return {
        priority: typeof o.priority === "number" ? o.priority : 0,
        host: typeof o.host === "string" ? o.host : "—",
      };
    }
    return { priority: 0, host: "—" };
  });
}

function normalizeEmailConfigPayload(data: Partial<EmailConfigResult>): EmailConfigResult {
  const mxRecords = normalizeMxRecords(data.mxRecords);
  const rawSpf = data.spf;
  const spf =
    rawSpf && typeof rawSpf === "object"
      ? {
          raw: typeof rawSpf.raw === "string" ? rawSpf.raw : "",
          status: coercePassFail(rawSpf.status),
        }
      : { raw: "", status: "fail" as const };
  const rawDkim = data.dkim;
  const dkim =
    rawDkim && typeof rawDkim === "object"
      ? {
          found: Boolean(rawDkim.found),
          ...(typeof rawDkim.selector === "string" ? { selector: rawDkim.selector } : {}),
        }
      : { found: false as const };
  const rawDmarc = data.dmarc;
  const dmarc =
    rawDmarc && typeof rawDmarc === "object"
      ? {
          raw: typeof rawDmarc.raw === "string" ? rawDmarc.raw : "",
          policy: typeof rawDmarc.policy === "string" ? rawDmarc.policy : "—",
          status: coercePassFail(rawDmarc.status),
        }
      : { raw: "", policy: "—", status: "fail" as const };
  return { mxRecords, spf, dkim, dmarc };
}

export function EmailConfigDetail({ data }: EmailConfigDetailProps) {
  const safe = normalizeEmailConfigPayload(data);
  const sortedMxRecords = [...safe.mxRecords].sort((a, b) => a.priority - b.priority);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">MX Records</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <caption className="sr-only">MX records discovered for the scanned domain</caption>
            <TableHeader>
              <TableRow>
                <TableHead>Priority</TableHead>
                <TableHead>Host</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedMxRecords.map((record) => (
                <TableRow key={`${record.priority}-${record.host}`}>
                  <TableCell className="font-medium">{record.priority}</TableCell>
                  <TableCell>{record.host}</TableCell>
                </TableRow>
              ))}
              {sortedMxRecords.length === 0 && (
                <TableRow>
                  <TableCell colSpan={2} className="text-center text-sm text-muted-foreground">
                    No MX records found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Email Security Checklist</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium text-zinc-900 dark:text-zinc-100">SPF</p>
              <Badge className={`border-transparent ${getStatusClass(safe.spf.status)}`}>{safe.spf.status}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{safe.spf.raw}</p>
          </div>

          <div className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium text-zinc-900 dark:text-zinc-100">DKIM</p>
              <Badge
                className={`border-transparent ${
                  safe.dkim.found
                    ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-200"
                    : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200"
                }`}
              >
                {safe.dkim.found ? "Found" : "Not Found"}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {safe.dkim.selector ? `Selector: ${safe.dkim.selector}` : "Selector unavailable"}
            </p>
          </div>

          <div className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium text-zinc-900 dark:text-zinc-100">DMARC</p>
              <Badge className={`border-transparent ${getStatusClass(safe.dmarc.status)}`}>{safe.dmarc.status}</Badge>
            </div>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">Policy: {safe.dmarc.policy}</p>
            <p className="mt-1 text-sm text-muted-foreground">{safe.dmarc.raw}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
