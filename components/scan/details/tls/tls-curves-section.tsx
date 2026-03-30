import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface TlsCurvesSectionProps {
  curves: string[];
}

export function TlsCurvesSection({ curves }: TlsCurvesSectionProps) {
  if (!curves || curves.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Elliptic Curves</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="list-inside list-decimal space-y-1 font-mono text-sm">
          {curves.map((curve, idx) => (
            <li key={`${curve}-${idx}`} className="text-zinc-700 dark:text-zinc-300">
              {curve}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
