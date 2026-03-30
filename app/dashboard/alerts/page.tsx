"use client";

import { Suspense, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { AlertDetailSheet } from "@/components/alerts/alert-detail-sheet";
import { AlertEmptyState } from "@/components/alerts/alert-empty-state";
import {
  AlertFilters,
  type AlertFilterValue,
} from "@/components/alerts/alert-filters";
import { AlertListTable } from "@/components/alerts/alert-list-table";
import { Button } from "@/components/ui/button";
import { useAppearanceLanguage } from "@/lib/hooks/use-appearance-language";
import { getAlertContentMessages } from "@/lib/i18n/alert-content";
import { useAcknowledgeAlert, useAlerts } from "@/lib/hooks/use-alerts";
import { useMonitors } from "@/lib/hooks/use-monitors";
import type { AlertEvent } from "@/shared/types/monitor";

const DEFAULT_PAGE = 1;
const PAGE_SIZE = 20;

function readPage(searchParams: URLSearchParams) {
  const raw = Number(searchParams.get("page"));
  return Number.isFinite(raw) && raw >= 1 ? raw : DEFAULT_PAGE;
}

function readFilters(searchParams: URLSearchParams): AlertFilterValue {
  const severity = searchParams.get("severity");
  const capability = searchParams.get("capability");
  const status = searchParams.get("status");

  return {
    severity:
      severity === "info" || severity === "warning" || severity === "critical"
        ? severity
        : "all",
    capability:
      capability === "uptime_only" ||
      capability === "content_change" ||
      capability === "ssl_expiry" ||
      capability === "visual_change"
        ? capability
        : "all",
    status:
      status === "unacknowledged" ||
      status === "acknowledged" ||
      status === "suppressed"
        ? status
        : "all",
  };
}

function AlertsPageContent() {
  const lang = useAppearanceLanguage();
  const messages = getAlertContentMessages(lang);
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const filters = readFilters(searchParams);
  const page = readPage(searchParams);
  const [selectedAlert, setSelectedAlert] = useState<AlertEvent | null>(null);

  const queryParams = useMemo(() => {
    return {
      page,
      limit: PAGE_SIZE,
      severity: filters.severity === "all" ? undefined : filters.severity,
      capability: filters.capability === "all" ? undefined : filters.capability,
      acknowledged:
        filters.status === "acknowledged"
          ? true
          : filters.status === "unacknowledged"
            ? false
            : undefined,
      suppressed:
        filters.status === "suppressed"
          ? true
          : filters.status === "unacknowledged"
            ? false
            : undefined,
    };
  }, [filters, page]);

  const alertsQuery = useAlerts(queryParams);
  const monitorsQuery = useMonitors({ page: 1, limit: 100 });
  const acknowledgeMutation = useAcknowledgeAlert();

  const alerts = alertsQuery.data?.data ?? [];
  const monitorsById = useMemo(
    () =>
      Object.fromEntries(
        (monitorsQuery.data?.data ?? []).map((monitor) => [monitor.id, monitor])
      ),
    [monitorsQuery.data]
  );
  const total = alertsQuery.data?.meta?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function updateQuery(next: Partial<AlertFilterValue> & { page?: number }) {
    const params = new URLSearchParams(searchParams.toString());
    const nextFilters = { ...filters, ...next };
    const nextPage = next.page ?? DEFAULT_PAGE;

    if (nextFilters.severity === "all") params.delete("severity");
    else params.set("severity", nextFilters.severity);

    if (nextFilters.capability === "all") params.delete("capability");
    else params.set("capability", nextFilters.capability);

    if (nextFilters.status === "all") params.delete("status");
    else params.set("status", nextFilters.status);

    if (nextPage <= DEFAULT_PAGE) params.delete("page");
    else params.set("page", String(nextPage));

    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  async function handleAcknowledge(alertId: string) {
    await acknowledgeMutation.mutateAsync(alertId);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
          {messages.pageTitle}
        </h1>
        <p className="text-muted-foreground">{messages.pageSubtitle}</p>
      </div>

      <AlertFilters
        value={filters}
        messages={messages}
        onChange={(nextValue) => updateQuery({ ...nextValue, page: DEFAULT_PAGE })}
      />

      {alertsQuery.isError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 dark:border-red-900 dark:bg-red-950/30">
          <h2 className="text-lg font-semibold text-red-900 dark:text-red-100">
            {messages.errorTitle}
          </h2>
          <p className="mt-2 text-sm text-red-700 dark:text-red-200">
            {messages.errorDescription}
          </p>
          <Button className="mt-4" onClick={() => void alertsQuery.refetch()}>
            {messages.actions.retry}
          </Button>
        </div>
      ) : alerts.length === 0 && !alertsQuery.isLoading ? (
        <AlertEmptyState
          title={messages.empty.title}
          description={messages.empty.description}
        />
      ) : (
        <>
          <AlertListTable
            alerts={alerts}
            monitorsById={monitorsById}
            messages={messages}
            isLoading={alertsQuery.isLoading}
            acknowledgingId={acknowledgeMutation.isPending ? acknowledgeMutation.variables : null}
            onSelect={setSelectedAlert}
            onAcknowledge={(alertId) => void handleAcknowledge(alertId)}
          />

          <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-sm text-muted-foreground">
              {messages.pagination
                .replace("{current}", String(page))
                .replace("{total}", String(totalPages))}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => updateQuery({ page: page - 1 })}
                disabled={page <= 1}
              >
                {messages.actions.previous}
              </Button>
              <Button
                variant="outline"
                onClick={() => updateQuery({ page: page + 1 })}
                disabled={page >= totalPages}
              >
                {messages.actions.next}
              </Button>
            </div>
          </div>
        </>
      )}

      <AlertDetailSheet
        alert={selectedAlert}
        monitor={selectedAlert ? monitorsById[selectedAlert.monitorId] : undefined}
        open={Boolean(selectedAlert)}
        messages={messages}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedAlert(null);
          }
        }}
      />
    </div>
  );
}

export default function AlertsPage() {
  return (
    <Suspense
      fallback={<div className="text-sm text-muted-foreground">Loading alerts...</div>}
    >
      <AlertsPageContent />
    </Suspense>
  );
}
