import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { LinkedPage, LinkedPagesResult } from "@/shared/types/scan";

interface LinkedPagesDetailProps {
  data: LinkedPagesResult;
}

function LinkList({ title, links, dotClass }: { title: string; links: LinkedPage[]; dotClass: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {links.length > 0 ? (
          links.map((link) => (
            <div key={`${link.url}-${link.text}`} className="flex items-start gap-3 rounded-md border border-zinc-200 px-3 py-2 dark:border-zinc-800">
              <span className={`mt-1.5 h-2 w-2 rounded-full ${dotClass}`} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{link.text}</p>
                <p className="truncate text-xs text-muted-foreground">{link.url}</p>
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">No links found.</p>
        )}
      </CardContent>
    </Card>
  );
}

export function LinkedPagesDetail({ data }: LinkedPagesDetailProps) {
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        {data.totalInternal} internal · {data.totalExternal} external
      </p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <LinkList title="Internal Links" links={data.internal ?? []} dotClass="bg-green-500" />
        <LinkList title="External Links" links={data.external ?? []} dotClass="bg-blue-500" />
      </div>
    </div>
  );
}
