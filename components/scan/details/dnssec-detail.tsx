import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KeyValueCard } from "@/components/scan/details/key-value-card";
import type { DnssecResult } from "@/shared/types/scan";

interface DnssecDetailProps {
  data: DnssecResult;
}

function statusBadge(value: boolean, passLabel = "Yes", failLabel = "No") {
  return (
    <Badge
      className={`border-transparent ${
        value ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-200" : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200"
      }`}
    >
      {value ? passLabel : failLabel}
    </Badge>
  );
}

export function DnssecDetail({ data }: DnssecDetailProps) {
  const dsRecords = Array.isArray(data.dsRecords) ? data.dsRecords : [];
  const dnskeyRecords = Array.isArray(data.dnskeyRecords) ? data.dnskeyRecords : [];

  return (
    <div className="space-y-6">
      <KeyValueCard
        title="DNSSEC Summary"
        items={[
          { label: "DNSSEC Enabled", value: statusBadge(data.enabled, "Enabled", "Disabled") },
          { label: "Signatures Valid", value: statusBadge(data.valid, "Valid", "Invalid") },
          { label: "Algorithm", value: data.algorithm },
          { label: "Key Tag", value: data.keyTag },
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">DS Records</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {dsRecords.length > 0 ? (
            dsRecords.map((record) => (
              <div key={record} className="rounded-md border border-zinc-200 px-3 py-2 text-sm font-mono dark:border-zinc-800">
                {record}
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No DS records found.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">DNSKEY Records</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {dnskeyRecords.length > 0 ? (
            dnskeyRecords.map((record) => (
              <div key={record} className="rounded-md border border-zinc-200 px-3 py-2 text-sm font-mono dark:border-zinc-800">
                {record}
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No DNSKEY records found.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
