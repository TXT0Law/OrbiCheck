import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { IpInfoResult } from "@/shared/types/scan";

interface IpDetailProps {
  data: IpInfoResult;
}

const rows: Array<{ key: keyof IpInfoResult; label: string }> = [
  { key: "ip", label: "IP Address" },
  { key: "asn", label: "ASN" },
  { key: "isp", label: "ISP" },
  { key: "country", label: "Country" },
  { key: "city", label: "City" },
  { key: "hostingProvider", label: "Hosting Provider" },
  { key: "ipType", label: "IP Type" },
];

export function IpDetail({ data }: IpDetailProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">IP Intelligence</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {rows.map((row) => {
            const v = data[row.key];
            const display = v == null || v === "" ? "—" : String(v);
            return (
              <div key={row.key} className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{row.label}</p>
                <p className="mt-1 text-sm font-medium text-zinc-900 dark:text-zinc-100">{display}</p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
