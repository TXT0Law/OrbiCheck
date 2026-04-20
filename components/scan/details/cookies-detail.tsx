import { CheckCircle2, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CookiesResult } from "@/shared/types/scan";

interface CookiesDetailProps {
  data: CookiesResult;
}

function normalizeSameSite(sameSite: string | undefined): "strict" | "lax" | "none" {
  if (sameSite === "strict" || sameSite === "lax" || sameSite === "none") {
    return sameSite;
  }

  return "none";
}

function getSameSiteBadgeClass(sameSite: "strict" | "lax" | "none") {
  if (sameSite === "strict") {
    return "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-200";
  }

  if (sameSite === "lax") {
    return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-200";
  }

  return "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200";
}

export function CookiesDetail({ data }: CookiesDetailProps) {
  const cookies = Array.isArray(data.cookies) ? data.cookies : [];
  const issuesCount = typeof data.issuesCount === "number" ? data.issuesCount : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Cookie Analysis</CardTitle>
        <p className="text-sm text-muted-foreground">
          Total: {cookies.length} cookies ·{" "}
          <span className={issuesCount > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}>
            Issues: {issuesCount}
          </span>
        </p>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <caption className="sr-only">Cookies detected for the scanned site</caption>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Domain</TableHead>
              <TableHead>Path</TableHead>
              <TableHead>Secure</TableHead>
              <TableHead>HttpOnly</TableHead>
              <TableHead>SameSite</TableHead>
              <TableHead>Expires</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cookies.map((cookie) => {
              const sameSiteKey = normalizeSameSite(cookie.sameSite);
              const sameSiteLabel = sameSiteKey;

              return (
                <TableRow key={`${cookie.name}-${cookie.domain}-${cookie.path}`}>
                  <TableCell className="max-w-[20rem] break-all font-medium">{cookie.name}</TableCell>
                  <TableCell className="max-w-[20rem] break-all">{cookie.domain}</TableCell>
                  <TableCell className="max-w-[20rem] break-all">{cookie.path}</TableCell>
                  <TableCell>
                    {cookie.secure ? (
                      <>
                        <CheckCircle2
                          className="h-4 w-4 text-green-600 dark:text-green-400"
                          aria-hidden="true"
                        />
                        <span className="sr-only">Yes</span>
                      </>
                    ) : (
                      <>
                        <XCircle
                          className="h-4 w-4 text-red-600 dark:text-red-400"
                          aria-hidden="true"
                        />
                        <span className="sr-only">No</span>
                      </>
                    )}
                  </TableCell>
                  <TableCell>
                    {cookie.httpOnly ? (
                      <>
                        <CheckCircle2
                          className="h-4 w-4 text-green-600 dark:text-green-400"
                          aria-hidden="true"
                        />
                        <span className="sr-only">Yes</span>
                      </>
                    ) : (
                      <>
                        <XCircle
                          className="h-4 w-4 text-red-600 dark:text-red-400"
                          aria-hidden="true"
                        />
                        <span className="sr-only">No</span>
                      </>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge className={`border-transparent ${getSameSiteBadgeClass(sameSiteKey)}`}>
                      {sameSiteLabel}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[20rem] break-all text-zinc-600 dark:text-zinc-300">
                    {cookie.expires}
                  </TableCell>
                </TableRow>
              );
            })}
            {cookies.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                  No cookies detected for this site.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
