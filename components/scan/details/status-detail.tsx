import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FetchOutcome, StatusResult } from "@/shared/types/scan";

interface StatusDetailProps {
  data: StatusResult;
}

const HTTP_ERROR_MIN = 400;
const HTTP_RESPONSE_LABELS: Record<number, string> = {
  403: "Access refused",
  429: "Rate limited",
  503: "Service unavailable",
};

const FETCH_FAILURE_LABELS: Record<Exclude<FetchOutcome, "http_response">, string> = {
  dns_error: "No HTTP response: DNS lookup failed",
  tls_error: "No HTTP response: TLS connection failed",
  timeout: "No HTTP response: request timed out",
  circuit_open: "No HTTP response: circuit breaker open",
  network_error: "No HTTP response: network connection failed",
};

export function StatusDetail({ data }: StatusDetailProps) {
  const failureLabel = data.fetchOutcome && data.fetchOutcome !== "http_response"
    ? FETCH_FAILURE_LABELS[data.fetchOutcome]
    : null;
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">HTTP Status</CardTitle>
        </CardHeader>
        <CardContent>
          <p
            className={`text-4xl font-bold ${
              data.httpStatusCode == null
                ? "text-muted-foreground"
                : data.httpStatusCode >= HTTP_ERROR_MIN
                  ? "text-red-600"
                  : "text-green-600"
            }`}
          >
            {data.httpStatusCode ?? "—"}
          </p>
          {data.httpStatusCode == null && (
            <p className="mt-2 text-sm text-muted-foreground">{failureLabel ?? "HTTP response unavailable"}</p>
          )}
          {data.httpStatusCode != null && HTTP_RESPONSE_LABELS[data.httpStatusCode] && (
            <p className="mt-2 text-sm text-muted-foreground">{HTTP_RESPONSE_LABELS[data.httpStatusCode]}</p>
          )}
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
