import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KeyValueCard } from "@/components/scan/details/key-value-card";
import type { SitemapResult } from "@/shared/types/scan";

interface SitemapDetailProps {
  data: SitemapResult;
}

export function SitemapDetail({ data }: SitemapDetailProps) {
  const sampleUrls = Array.isArray(data.sampleUrls) ? data.sampleUrls : [];

  return (
    <div className="space-y-6">
      <KeyValueCard
        title="Sitemap Summary"
        items={[
          {
            label: "Exists",
            value: (
              <Badge
                className={`border-transparent ${
                  data.exists
                    ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-200"
                    : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200"
                }`}
              >
                {data.exists ? "Found" : "Not Found"}
              </Badge>
            ),
          },
          { label: "URL", value: data.url },
          { label: "Total Pages", value: data.urlCount },
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Sample URLs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {sampleUrls.length > 0 ? (
            sampleUrls.map((url) => (
              <div key={url} className="truncate rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800">
                {url}
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No sample URLs available.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
