import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KeyValueCard } from "@/components/scan/details/key-value-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ArchivesResult } from "@/shared/types/scan";

interface ArchivesDetailProps {
  data: ArchivesResult;
}

function statusClass(statusCode: number) {
  if (statusCode === 200) {
    return "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-200";
  }

  if (statusCode >= 300 && statusCode < 400) {
    return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-200";
  }

  if (statusCode >= 400) {
    return "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200";
  }

  return "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function formatDateOptional(dateString: string | undefined) {
  if (!dateString) {
    return "—";
  }

  return formatDate(dateString);
}

function getSpanYears(oldestSnapshot: string, newestSnapshot: string) {
  const oldest = new Date(oldestSnapshot).getTime();
  const newest = new Date(newestSnapshot).getTime();
  if (Number.isNaN(oldest) || Number.isNaN(newest)) {
    return "—";
  }
  const years = (newest - oldest) / (1000 * 60 * 60 * 24 * 365.25);

  return `~${years.toFixed(1)} years`;
}

function spanSummary(oldestSnapshot: string | undefined, newestSnapshot: string | undefined) {
  if (!oldestSnapshot || !newestSnapshot) {
    return "—";
  }

  return getSpanYears(oldestSnapshot, newestSnapshot);
}

export function ArchivesDetail({ data }: ArchivesDetailProps) {
  const snapshots = Array.isArray(data.snapshots) ? data.snapshots : [];

  return (
    <div className="space-y-6">
      <KeyValueCard
        title="Archive Summary"
        items={[
          { label: "Total Snapshots", value: data.totalSnapshots },
          { label: "Oldest", value: formatDateOptional(data.oldestSnapshot) },
          { label: "Newest", value: formatDateOptional(data.newestSnapshot) },
          { label: "Span", value: spanSummary(data.oldestSnapshot, data.newestSnapshot) },
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Recent Snapshots</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>URL</TableHead>
                <TableHead>Status Code</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {snapshots.length > 0 ? (
                snapshots.map((snapshot) => (
                  <TableRow key={`${snapshot.timestamp}-${snapshot.url}`}>
                    <TableCell>{formatDateOptional(snapshot.timestamp)}</TableCell>
                    <TableCell>
                      <a
                        href={snapshot.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block max-w-[460px] truncate text-zinc-600 underline underline-offset-2 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
                      >
                        {snapshot.url}
                      </a>
                    </TableCell>
                    <TableCell>
                      <Badge className={`border-transparent ${statusClass(snapshot.statusCode)}`}>{snapshot.statusCode}</Badge>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-sm text-muted-foreground">
                    No snapshots returned.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
