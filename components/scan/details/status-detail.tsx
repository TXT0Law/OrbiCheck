import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { StatusResult } from "@/shared/types/scan";

interface StatusDetailProps {
  data: StatusResult;
}

export function StatusDetail({ data }: StatusDetailProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">HTTP Status</CardTitle>
        </CardHeader>
        <CardContent>
          <p
            className={`text-4xl font-bold ${
              data.httpStatusCode != null && data.httpStatusCode >= 400
                ? "text-red-600"
                : "text-green-600"
            }`}
          >
            {data.httpStatusCode ?? "—"}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Response Time</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-4xl font-bold text-zinc-900 dark:text-zinc-100">
            {data.responseTimeMs != null ? `${data.responseTimeMs}ms` : "—"}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Server Header</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-lg font-medium text-zinc-900 dark:text-zinc-100">
            {data.serverHeader || "—"}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Content Type</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-lg font-medium text-zinc-900 dark:text-zinc-100">
            {data.contentType || "—"}
          </p>
        </CardContent>
      </Card>

      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Redirect Count</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-lg font-medium text-zinc-900 dark:text-zinc-100">
            {data.redirectCount ?? "—"}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
