import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KeyValueCard } from "@/components/scan/details/key-value-card";
import type { SecurityTxtResult } from "@/shared/types/scan";

interface SecurityTxtDetailProps {
  data: SecurityTxtResult;
}

function renderField(value: string | null) {
  return value ?? <span className="text-muted-foreground">Not specified</span>;
}

export function SecurityTxtDetail({ data }: SecurityTxtDetailProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <p className="shrink-0 text-sm text-muted-foreground">security.txt status:</p>
        <Badge
          className={`border-transparent ${
            data.exists
              ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-200"
              : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200"
          }`}
        >
          {data.exists ? "Found" : "Not Found"}
        </Badge>
        <p className="min-w-0 max-w-full break-all text-sm text-zinc-600 dark:text-zinc-300">{data.url}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Raw Content</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-md bg-zinc-50 p-4 text-sm font-mono text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
            {data.rawContent}
          </pre>
        </CardContent>
      </Card>

      <KeyValueCard
        title="Parsed Fields"
        items={[
          { label: "Contact", value: renderField(data.contact) },
          { label: "Expires", value: renderField(data.expires) },
          { label: "Encryption", value: renderField(data.encryption) },
          { label: "Acknowledgments", value: renderField(data.acknowledgments) },
          { label: "Preferred Languages", value: renderField(data.preferredLanguages) },
          { label: "Policy", value: renderField(data.policy) },
        ]}
      />
    </div>
  );
}
