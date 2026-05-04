import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TechCategoryChart } from "@/components/scan/charts/tech-category-chart";
import type { TechStackItem } from "@/shared/types/scan";

interface TechStackDetailProps {
  data: TechStackItem[] | null | undefined;
}

const HIGH_CONFIDENCE_THRESHOLD = 80;
const MEDIUM_CONFIDENCE_THRESHOLD = 50;

function clampConfidence(raw: number): number {
  if (!Number.isFinite(raw)) return 0;
  if (raw < 0) return 0;
  if (raw > 100) return 100;
  return raw;
}

function pickConfidenceTone(value: number): {
  bar: string;
  label: string;
} {
  if (value >= HIGH_CONFIDENCE_THRESHOLD) {
    return {
      bar: "bg-emerald-500",
      label: "text-emerald-700 dark:text-emerald-300",
    };
  }
  if (value >= MEDIUM_CONFIDENCE_THRESHOLD) {
    return {
      bar: "bg-amber-500",
      label: "text-amber-700 dark:text-amber-300",
    };
  }
  return {
    bar: "bg-red-500",
    label: "text-red-700 dark:text-red-300",
  };
}

function ConfidenceBar({ value }: { value: number }) {
  const clamped = clampConfidence(value);
  const tone = pickConfidenceTone(clamped);
  return (
    <div
      className="flex w-full max-w-[10rem] flex-col gap-1"
      role="img"
      aria-label={`Confidence ${Math.round(clamped)}%`}
    >
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Confidence</span>
        <span className={`font-medium tabular-nums ${tone.label}`}>
          {Math.round(clamped)}%
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div
          className={`h-full ${tone.bar} transition-all duration-500`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
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
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Technology Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <TechCategoryChart data={items} />
        </CardContent>
      </Card>

      {Object.entries(groups).map(([category, items]) => (
        <Card key={category}>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">{category}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {items.map((item, idx) => (
              <div
                key={`${category}-${idx}-${item.name}-${item.version ?? ""}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-zinc-200 px-3 py-2 dark:border-zinc-800"
              >
                <div className="min-w-0">
                  <p className="font-medium text-zinc-900 dark:text-zinc-100">{item.name}</p>
                  <p className="text-sm text-muted-foreground">{item.version ? `Version ${item.version}` : "Version unknown"}</p>
                </div>
                <ConfidenceBar value={item.confidence} />
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
