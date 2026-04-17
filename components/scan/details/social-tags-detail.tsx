import Image from "next/image";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SocialTagsResult } from "@/shared/types/scan";

interface SocialTagsDetailProps {
  data: SocialTagsResult;
}

function valueOrNotSet(value: string | null) {
  return value ?? <span className="italic text-muted-foreground">Not set</span>;
}

export function SocialTagsDetail({ data }: SocialTagsDetailProps) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Open Graph Tags</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {data.ogImage ? (
            <div className="overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800">
              <Image
                src={data.ogImage}
                alt="Open Graph preview"
                width={1200}
                height={630}
                unoptimized
                className="max-h-40 w-auto max-w-full object-contain"
              />
            </div>
          ) : null}

          <div className="space-y-2">
            <div className="min-w-0 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">og:title</p>
              <p className="mt-1 break-words text-sm text-zinc-900 dark:text-zinc-100">{valueOrNotSet(data.ogTitle)}</p>
            </div>
            <div className="min-w-0 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">og:description</p>
              <p className="mt-1 break-words text-sm text-zinc-900 dark:text-zinc-100">{valueOrNotSet(data.ogDescription)}</p>
            </div>
            <div className="min-w-0 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">og:image</p>
              <p className="mt-1 break-all text-sm text-zinc-900 dark:text-zinc-100">{valueOrNotSet(data.ogImage)}</p>
            </div>
            <div className="min-w-0 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">og:url</p>
              <p className="mt-1 break-all text-sm text-zinc-900 dark:text-zinc-100">{valueOrNotSet(data.ogUrl)}</p>
            </div>
            <div className="min-w-0 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">og:type</p>
              <p className="mt-1 break-words text-sm text-zinc-900 dark:text-zinc-100">{valueOrNotSet(data.ogType)}</p>
            </div>
            <div className="min-w-0 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">og:site_name</p>
              <p className="mt-1 break-words text-sm text-zinc-900 dark:text-zinc-100">{valueOrNotSet(data.ogSiteName)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Twitter Card Tags</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="min-w-0 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">twitter:card</p>
            <p className="mt-1 break-words text-sm text-zinc-900 dark:text-zinc-100">{valueOrNotSet(data.twitterCard)}</p>
          </div>
          <div className="min-w-0 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">twitter:site</p>
            <p className="mt-1 break-words text-sm text-zinc-900 dark:text-zinc-100">{valueOrNotSet(data.twitterSite)}</p>
          </div>
          <div className="min-w-0 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">twitter:title</p>
            <p className="mt-1 break-words text-sm text-zinc-900 dark:text-zinc-100">{valueOrNotSet(data.twitterTitle)}</p>
          </div>
          <div className="min-w-0 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">twitter:description</p>
            <p className="mt-1 break-words text-sm text-zinc-900 dark:text-zinc-100">{valueOrNotSet(data.twitterDescription)}</p>
          </div>
          <div className="min-w-0 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">twitter:image</p>
            <p className="mt-1 break-all text-sm text-zinc-900 dark:text-zinc-100">{valueOrNotSet(data.twitterImage)}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
