import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FeatureItem, FeaturesResult } from "@/shared/types/scan";

interface FeaturesDetailProps {
  data: FeaturesResult | null | undefined;
}

export function FeaturesDetail({ data }: FeaturesDetailProps) {
  const features = Array.isArray(data?.features) ? data.features : [];

  if (features.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Site Features</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">No feature profile data is available for this scan.</CardContent>
      </Card>
    );
  }

  const groups = features.reduce<Record<string, FeatureItem[]>>((acc, item) => {
    const category = item.category ?? "Other";
    acc[category] = acc[category] ? [...acc[category], item] : [item];
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {Object.entries(groups).map(([category, features]) => (
        <Card key={category}>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">{category}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {features.map((feature, idx) => (
              <div
                key={`${category}-${idx}-${feature.name}`}
                className="flex items-center justify-between rounded-md border border-zinc-200 px-3 py-2 dark:border-zinc-800"
              >
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{feature.name}</p>
                <Badge
                  className={`border-transparent ${
                    feature.detected
                      ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-200"
                      : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                  }`}
                >
                  {feature.detected ? "Detected" : "Not Found"}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
