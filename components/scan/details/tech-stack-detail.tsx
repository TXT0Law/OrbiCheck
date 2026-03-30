import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TechStackItem } from "@/shared/types/scan";

interface TechStackDetailProps {
  data: TechStackItem[] | null | undefined;
}

export function TechStackDetail({ data }: TechStackDetailProps) {
  const items = Array.isArray(data) ? data : [];

  if (items.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Technology Stack</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">No technology fingerprint data is available for this scan.</CardContent>
      </Card>
    );
  }

  const groups = items.reduce<Record<string, TechStackItem[]>>((acc, item) => {
    const category = item.category ?? "Other";
    acc[category] = acc[category] ? [...acc[category], item] : [item];
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {Object.entries(groups).map(([category, items]) => (
        <Card key={category}>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">{category}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {items.map((item, idx) => (
              <div
                key={`${category}-${idx}-${item.name}-${item.version ?? ""}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-zinc-200 px-3 py-2 dark:border-zinc-800"
              >
                <div>
                  <p className="font-medium text-zinc-900 dark:text-zinc-100">{item.name}</p>
                  <p className="text-sm text-muted-foreground">{item.version ? `Version ${item.version}` : "Version unknown"}</p>
                </div>
                <Badge variant="outline">{item.confidence}% confidence</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
