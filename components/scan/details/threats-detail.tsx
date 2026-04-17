import { CheckCircle2, AlertTriangle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ThreatsResult } from "@/shared/types/scan";

interface ThreatsDetailProps {
  data: ThreatsResult;
}

export function ThreatsDetail({ data }: ThreatsDetailProps) {
  const entries = Array.isArray(data.entries) ? data.entries : [];
  const isClean = data.listedCount === 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-lg font-semibold">Threat Intelligence Summary</CardTitle>
          <p className="text-sm text-muted-foreground">
            {entries.length > 0
              ? `Listed on ${data.listedCount} / ${entries.length} sources`
              : "No sources available"}
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            {isClean ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" aria-hidden="true" />
                <p className="text-lg font-semibold text-green-700 dark:text-green-300">Clean</p>
              </>
            ) : (
              <>
                <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
                <p className="text-lg font-semibold text-red-700 dark:text-red-300">Flagged ({data.listedCount})</p>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <Card id="block-lists" className="scroll-mt-24">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Block List Sources</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <caption className="sr-only">Threat intelligence source results</caption>
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead>Listed</TableHead>
                <TableHead>Detail</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.source}>
                  <TableCell className="font-medium">{entry.source}</TableCell>
                  <TableCell>
                    <Badge
                      className={`border-transparent ${
                        entry.listed
                          ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200"
                          : "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-200"
                      }`}
                    >
                      {entry.listed ? "Listed" : "Clean"}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[36rem] whitespace-normal break-words text-zinc-600 dark:text-zinc-300">
                    {entry.detail}
                  </TableCell>
                </TableRow>
              ))}
              {entries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-sm text-muted-foreground">
                    No threat intelligence sources were checked.
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
