import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RankingAndCarbonResult } from "@/shared/types/scan";

interface RankingDetailProps {
  data: RankingAndCarbonResult;
}

function formatRank(rank: number | null) {
  return rank === null ? "Unranked" : `#${rank.toLocaleString("en-US")}`;
}

const DEFAULT_RANKING = {
  globalRank: null as number | null,
  countryRank: null as number | null,
  categoryRank: null as number | null,
  country: null as string | null,
  category: null as string | null,
};

const DEFAULT_CARBON = {
  isGreen: false,
  co2PerPageview: 0,
  cleanerThanPercent: 0,
  energyPerVisit: 0,
};

export function RankingDetail({ data }: RankingDetailProps) {
  const ranking = data.ranking ?? DEFAULT_RANKING;
  const carbon = data.carbon ?? DEFAULT_CARBON;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Global Ranking</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground">Global Rank</p>
            <p className={`mt-1 text-3xl font-bold ${ranking.globalRank === null ? "text-muted-foreground" : "text-zinc-900 dark:text-zinc-100"}`}>
              {formatRank(ranking.globalRank)}
            </p>
          </div>

          <div className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Country</p>
            <p className="mt-1 text-sm font-medium text-zinc-900 dark:text-zinc-100">{ranking.country ?? "Unknown"}</p>
            <p className="mt-1 text-xs text-muted-foreground">Rank: {formatRank(ranking.countryRank)}</p>
          </div>

          <div className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Category</p>
            <p className="mt-1 text-sm font-medium text-zinc-900 dark:text-zinc-100">{ranking.category ?? "Unknown"}</p>
            <p className="mt-1 text-xs text-muted-foreground">Rank: {formatRank(ranking.categoryRank)}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Carbon Footprint</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground">Green Hosting</p>
            <Badge
              className={`mt-2 border-transparent ${
                carbon.isGreen
                  ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-200"
                  : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
              }`}
            >
              {carbon.isGreen ? "Green Hosted" : "Not Green"}
            </Badge>
          </div>

          <div className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">CO2 per Pageview</p>
            <p className="mt-1 text-sm font-medium text-zinc-900 dark:text-zinc-100">{carbon.co2PerPageview}g</p>
          </div>

          <div className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Cleaner Than</p>
            <p
              className={`mt-1 text-sm font-medium ${
                carbon.cleanerThanPercent >= 50 ? "text-green-700 dark:text-green-300" : "text-red-700 dark:text-red-300"
              }`}
            >
              {carbon.cleanerThanPercent}% of pages tested
            </p>
          </div>

          <div className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Energy per Visit</p>
            <p className="mt-1 text-sm font-medium text-zinc-900 dark:text-zinc-100">{carbon.energyPerVisit} kWh</p>
          </div>
        </CardContent>
      </Card>

      <Card id="legacy-rank" className="scroll-mt-24 md:col-span-2">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Additional Ranking Data</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            When available, additional ranking signals from alternative providers are merged into the
            ranking data shown above.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
