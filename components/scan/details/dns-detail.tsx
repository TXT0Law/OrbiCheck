import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { DnsResult } from "@/shared/types/scan";

interface DnsDetailProps {
  data: DnsResult;
}

const records: Array<{ key: keyof DnsResult; label: string }> = [
  { key: "a", label: "A" },
  { key: "aaaa", label: "AAAA" },
  { key: "cname", label: "CNAME" },
  { key: "mx", label: "MX" },
  { key: "ns", label: "NS" },
  { key: "txt", label: "TXT" },
  { key: "soa", label: "SOA" },
];

export function DnsDetail({ data }: DnsDetailProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">DNS Records</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="a" className="space-y-4">
          <TabsList className="h-auto flex-wrap gap-1 bg-transparent p-0">
            {records.map((record) => (
              <TabsTrigger key={record.key} value={record.key} className="border border-zinc-200 dark:border-zinc-800">
                {record.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {records.map((record) => {
            const values = (data[record.key] as string[] | undefined) ?? [];
            return (
              <TabsContent
                key={record.key}
                value={record.key}
                className="scroll-mt-24 space-y-2"
                id={
                  record.key === "txt"
                    ? "txt-records"
                    : record.key === "ns"
                      ? "dns-server"
                      : undefined
                }
              >
                {values.length > 0 ? (
                  values.map((value) => (
                    <div
                      key={value}
                      className="min-w-0 break-all rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800"
                    >
                      {value}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No records found.</p>
                )}
              </TabsContent>
            );
          })}
          <p className="sr-only">DNS record groups for the scanned domain</p>
        </Tabs>
      </CardContent>
    </Card>
  );
}
