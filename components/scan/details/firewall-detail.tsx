import { Badge } from "@/components/ui/badge";
import { KeyValueCard } from "@/components/scan/details/key-value-card";
import type { FirewallResult } from "@/shared/types/scan";

interface FirewallDetailProps {
  data: FirewallResult;
}

export function FirewallDetail({ data }: FirewallDetailProps) {
  const confidenceLabel =
    typeof data.confidence === "number" && Number.isFinite(data.confidence)
      ? `${data.confidence}%`
      : "—";
  const evidence =
    data.evidence != null && data.evidence !== "" ? data.evidence : "—";

  return (
    <KeyValueCard
      title="Firewall Detection"
      items={[
        {
          label: "Detected",
          value: (
            <Badge
              className={`border-transparent ${
                data.detected
                  ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-200"
                  : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
              }`}
            >
              {data.detected ? "Yes" : "No"}
            </Badge>
          ),
        },
        { label: "Provider", value: data.provider ?? "Unknown" },
        { label: "Confidence", value: confidenceLabel },
        { label: "Evidence", value: <span className="text-zinc-600 dark:text-zinc-300">{evidence}</span> },
      ]}
    />
  );
}
