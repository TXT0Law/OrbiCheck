import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RobotsTxtResult } from "@/shared/types/scan";

interface RobotsTxtDetailProps {
  data: RobotsTxtResult | null | undefined;
}

export function RobotsTxtDetail({ data }: RobotsTxtDetailProps) {
  if (!data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">robots.txt</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">robots.txt data is unavailable for this scan.</CardContent>
      </Card>
    );
  }

  const allowedPaths = Array.isArray(data.allowedPaths) ? data.allowedPaths : [];
  const disallowedPaths = Array.isArray(data.disallowedPaths) ? data.disallowedPaths : [];
  const sitemapUrls = Array.isArray(data.sitemapUrls) ? data.sitemapUrls : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <p className="text-sm text-muted-foreground">robots.txt status:</p>
        <Badge
          className={`border-transparent ${
            data.exists
              ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-200"
              : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200"
          }`}
        >
          {data.exists ? "Found" : "Not Found"}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Raw Content</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-md bg-zinc-50 p-4 text-sm font-mono text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
            {data.rawContent ?? ""}
          </pre>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Allowed Paths</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {allowedPaths.length > 0 ? (
              allowedPaths.map((path) => (
                <p key={path} className="break-all text-sm text-green-700 dark:text-green-300">
                  {path}
                </p>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No allowed paths listed.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Disallowed Paths</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {disallowedPaths.length > 0 ? (
              disallowedPaths.map((path) => (
                <p key={path} className="break-all text-sm text-red-700 dark:text-red-300">
                  {path}
                </p>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No disallowed paths listed.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {sitemapUrls.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Sitemap URLs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {sitemapUrls.map((url) => (
              <p key={url} className="break-all text-sm text-muted-foreground" title={url}>
                {url}
              </p>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
