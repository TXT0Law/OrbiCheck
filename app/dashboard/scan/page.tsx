"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Globe } from "lucide-react";

import { RescanAllButton } from "@/components/scan/rescan-all-button";
import { ScanGroupView } from "@/components/scan/scan-group-view";
import {
  ScanViewToggle,
  type ScanViewMode,
} from "@/components/scan/scan-view-toggle";
import { EditGroupDialog } from "@/components/scan/groups/edit-group-dialog";
import { ScanInput } from "@/components/dashboard/scan-input";
import { SCAN_MODULES } from "@/lib/constants/scan-modules";
import { ScanProgress } from "@/components/scan/scan-progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cancelScan, createScan, type ScanListSortBy, type ScanStatusGroup } from "@/lib/api/scans";
import { useDeleteAllScans, useDeleteScan, useRescan, useScanList } from "@/lib/hooks/use-scan-list";
import { useScanStore } from "@/lib/stores/scan-store";
import type { UrlGroup } from "@/types/url-group";

function ScanInputFromQuery({
  onSubmit,
  selectedModules,
  onModulesChange,
}: {
  onSubmit: (urls: string[], options?: { modules?: string[] }) => Promise<void>;
  selectedModules: Set<string>;
  onModulesChange: (modules: Set<string>) => void;
}) {
  const searchParams = useSearchParams();
  const prefilledUrl = searchParams.get("url") ?? "";
  return (
    <ScanInput
      prefilledUrl={prefilledUrl}
      onSubmit={onSubmit}
      selectedModules={selectedModules}
      onModulesChange={onModulesChange}
    />
  );
}

export default function ScanPage() {
  const queryClient = useQueryClient();
  const activeScan = useScanStore((s) => s.activeScan);
  const setActiveScan = useScanStore((s) => s.setActiveScan);
  const clearActiveScan = useScanStore((s) => s.clearActiveScan);
  const progress = useScanStore((s) => s.activeScanProgress);
  const progressError = useScanStore((s) => s.activeScanProgressError);
  const [recentScanStartedAt, setRecentScanStartedAt] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [startSuccess, setStartSuccess] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<ScanListSortBy>("created_at_desc");
  const [statusGroup, setStatusGroup] = useState<ScanStatusGroup>("all");
  const [viewMode, setViewMode] = useState<ScanViewMode>("flat");
  const [editingGroup, setEditingGroup] = useState<UrlGroup | null>(null);
  const [selectedModules, setSelectedModules] = useState<Set<string>>(
    () => new Set(SCAN_MODULES)
  );

  const { mutate: removeScan, isPending: isDeleting } = useDeleteScan();
  const { mutate: removeAllScans, isPending: isDeletingAll } = useDeleteAllScans();
  const { mutate: rescan, isPending: isRescanning } = useRescan();

  const { data: scanList, isFetching } = useScanList(
    {
      page: 1,
      size: 50,
      search: searchTerm,
      sortBy,
      statusGroup,
    },
    { refetchWhenActive: true }
  );

  const handleCancelProgress = useCallback(() => {
    if (!activeScan) {
      return;
    }
    const scanId = activeScan.scanId;
    void (async () => {
      setStartError(null);
      try {
        await cancelScan(scanId);
        setStartSuccess("Scan stopped. It stays in your history with partial results.");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setStartError(`Could not stop scan: ${message}`);
        return;
      }
      clearActiveScan();
      queryClient.invalidateQueries({ queryKey: ["scans"] });
      queryClient.invalidateQueries({ queryKey: ["url-groups"] });
    })();
  }, [activeScan, clearActiveScan, queryClient]);

  const handleSubmitScans = async (
    urls: string[],
    options?: { modules?: string[] }
  ) => {
    setStartError(null);
    setStartSuccess(null);
    const createdScans = [];

    for (const url of urls) {
      try {
        const scan = await createScan(url, {
          modules: options?.modules && options.modules.length > 0 ? options.modules : undefined,
        });
        createdScans.push(scan);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        setStartError((prev) =>
          prev ? `${prev}\nFailed ${url}: ${reason}` : `Failed to start scan for ${url}: ${reason}`
        );
        console.error("Failed to start scan:", error);
      }
    }

    queryClient.invalidateQueries({ queryKey: ["scans"] });

    if (createdScans.length > 0) {
      setStartSuccess(
        createdScans.length === 1 ? "Scan started" : `${createdScans.length} scans started`
      );
      const latest = createdScans[createdScans.length - 1];
      const domain =
        latest.domain ?? (() => {
          try {
            return new URL(latest.url).hostname;
          } catch {
            return "";
          }
        })();
      setActiveScan({
        scanId: latest.id,
        url: latest.url,
        domain: domain ?? "",
      });
      setRecentScanStartedAt(new Date().toISOString());
    }
  };

  const progressValue = progress?.progress ?? 0;

  const mappedScans = (scanList?.scans ?? []).map((scan) => ({
    id: scan.id,
    domain: scan.domain,
    url: scan.url,
    progress: scan.progress,
    securityScore: scan.securityScore,
    status:
      scan.status === "completed"
        ? ("completed" as const)
        : scan.status === "running" || scan.status === "pending"
          ? ("running" as const)
          : scan.status === "cancelled"
            ? ("failed" as const)
          : ("failed" as const),
    backendStatus: scan.status,
    vulnCount: 0,
    createdAt: scan.createdAt,
  }));

  const optimisticScan = activeScan
    ? {
          id: activeScan.scanId,
          domain: activeScan.domain,
          url: activeScan.url,
          progress: progressValue,
          securityScore: null,
          status: "running" as const,
          backendStatus: "running",
          vulnCount: 0,
          createdAt: recentScanStartedAt ?? new Date().toISOString(),
      }
    : null;

  const recentScans = optimisticScan
    ? [
        optimisticScan,
        ...mappedScans.filter((scan) => scan.id !== optimisticScan.id),
      ]
    : mappedScans;

  const renderStatus = (status: string) => {
    if (status === "completed") {
      return <Badge variant="secondary">Completed</Badge>;
    }

    if (status === "running" || status === "pending") {
      return <Badge variant="default">Running</Badge>;
    }

    if (status === "cancelled") {
      return <Badge variant="outline">Cancelled</Badge>;
    }

    return <Badge variant="destructive">Failed</Badge>;
  };

  const handleDelete = (scanId: string) => {
    const shouldDelete = window.confirm("Delete this scan? This cannot be undone.");
    if (!shouldDelete) {
      return;
    }
    removeScan(scanId, {
      onError: (error) => {
        const reason = error instanceof Error ? error.message : String(error);
        setStartError(`Delete failed: ${reason}`);
      },
    });
  };

  const handleRescan = (scan: { id: string; url: string; domain?: string }) => {
    setStartError(null);
    rescan(
      { scanId: scan.id },
      {
        onSuccess: () => {
          setActiveScan({
            scanId: scan.id,
            url: scan.url,
            domain: scan.domain ?? new URL(scan.url).hostname ?? "",
          });
          setRecentScanStartedAt(new Date().toISOString());
        },
        onError: (error) => {
          const reason = error instanceof Error ? error.message : String(error);
          setStartError(`Rescan failed: ${reason}`);
        },
      }
    );
  };

  const applySearch = () => {
    setSearchTerm(searchInput.trim());
  };

  const resetFilters = () => {
    setSearchInput("");
    setSearchTerm("");
    setSortBy("created_at_desc");
    setStatusGroup("all");
  };

  const handleDeleteAll = () => {
    const shouldDelete = window.confirm("Delete all scans in current filter results?");
    if (!shouldDelete) {
      return;
    }

    removeAllScans(
      {
        search: searchTerm,
        statusGroup,
      },
      {
        onSuccess: (deleted) => {
          setStartError(deleted > 0 ? null : "No scans matched current filters to delete.");
        },
        onError: (error) => {
          const reason = error instanceof Error ? error.message : String(error);
          setStartError(`Delete all failed: ${reason}`);
        },
      }
    );
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
          Scan
        </h1>
        <p className="mt-1 text-muted-foreground">
          Launch a new target scan and review external security posture signals.
        </p>
      </div>

      <Suspense
        fallback={
          <ScanInput
            onSubmit={handleSubmitScans}
            selectedModules={selectedModules}
            onModulesChange={setSelectedModules}
          />
        }
      >
        <ScanInputFromQuery
          onSubmit={handleSubmitScans}
          selectedModules={selectedModules}
          onModulesChange={setSelectedModules}
        />
      </Suspense>

      {activeScan && (
        <div className="space-y-2">
          <ScanProgress
            domain={activeScan.domain}
            progress={progress?.progress ?? 0}
            phase={progress?.phase ?? "quick"}
            detail={progress?.detail ?? "Queuing scan..."}
            onCancel={handleCancelProgress}
          />
          {progressError && (
            <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              {progressError}
            </p>
          )}
        </div>
      )}

      {startError ? (
        <p className="whitespace-pre-wrap rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
          {startError}
        </p>
      ) : null}
      {startSuccess ? (
        <p className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-700 dark:border-green-900 dark:bg-green-950/30 dark:text-green-200">
          {startSuccess}
        </p>
      ) : null}

      <Card>
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <CardTitle className="text-lg font-semibold">Scan List</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm text-muted-foreground">
                {scanList?.total ?? 0} results {isFetching ? "(refreshing...)" : ""}
              </p>
              <RescanAllButton
                scans={scanList?.scans ?? []}
                onComplete={() =>
                  queryClient.invalidateQueries({ queryKey: ["scans"] })
                }
                disabled={isFetching}
              />
              <Button
                onClick={handleDeleteAll}
                disabled={isDeletingAll || (scanList?.total ?? 0) === 0}
                className="h-8 bg-red-600 px-3 text-white hover:bg-red-700 disabled:bg-zinc-300 disabled:text-zinc-600"
              >
                {isDeletingAll ? "Deleting..." : "Delete All"}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-[1fr_180px_180px_180px_180px]">
            <div className="col-span-2 flex flex-wrap items-center gap-2">
              <ScanViewToggle mode={viewMode} onChange={setViewMode} />
              <Input
                className="min-w-0"
                aria-label="Search scans"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    applySearch();
                  }
                }}
                placeholder="Search URL or domain"
              />
            </div>
            <select
              aria-label="Sort scans"
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as ScanListSortBy)}
              className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            >
              <option value="created_at_desc">Newest first</option>
              <option value="created_at_asc">Oldest first</option>
              <option value="security_score_desc">Security score: high to low</option>
              <option value="security_score_asc">Security score: low to high</option>
              <option value="domain_asc">Domain: A to Z</option>
              <option value="domain_desc">Domain: Z to A</option>
              <option value="progress_desc">Progress: high to low</option>
            </select>

            <select
              aria-label="Category filter"
              value={statusGroup}
              onChange={(event) => setStatusGroup(event.target.value as ScanStatusGroup)}
              className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            >
              <option value="all">Category: All</option>
              <option value="active">Category: Active</option>
              <option value="completed">Category: Completed</option>
              <option value="failed">Category: Failed</option>
              <option value="cancelled">Category: Cancelled</option>
            </select>

            <Button
              onClick={applySearch}
              className="h-10 w-full"
            >
              Search
            </Button>
            <Button
              variant="outline"
              onClick={resetFilters}
              className="h-10 w-full"
            >
              Reset
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-2">
          {viewMode === "group" ? (
            <ScanGroupView
              onEdit={setEditingGroup}
              searchTerm={searchTerm}
              sortBy={sortBy}
            />
          ) : recentScans.length === 0 ? (
            <p className="rounded-md border border-dashed border-zinc-300 p-6 text-center text-sm text-muted-foreground dark:border-zinc-700">
              No scans found for current filters.
            </p>
          ) : (
            recentScans.map((scan) => (
              <div
                key={scan.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-800"
              >
                <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/dashboard/scan/${scan.id}`}
                    className="block truncate font-medium text-zinc-900 hover:underline dark:text-zinc-100"
                  >
                    {scan.domain}
                  </Link>
                  <p className="truncate text-xs text-muted-foreground">{scan.url}</p>
                </div>

                <div className="hidden text-sm text-muted-foreground md:block">{scan.progress}%</div>
                <div className="hidden text-sm text-muted-foreground md:block">
                  Security {scan.securityScore ?? "-"}
                </div>
                {renderStatus(scan.backendStatus)}

                <div className="flex w-full shrink-0 items-center gap-2 sm:w-auto">
                  <Button
                    onClick={() =>
                      handleRescan({
                        id: scan.id,
                        url: scan.url,
                        domain: scan.domain,
                      })
                    }
                    disabled={
                      isRescanning ||
                      scan.backendStatus === "running" ||
                      scan.backendStatus === "pending"
                    }
                    className="h-8 bg-zinc-900 px-3 text-xs text-white hover:bg-zinc-800"
                  >
                    {isRescanning ? "Rescanning..." : "Rescan"}
                  </Button>
                  <Button
                    onClick={() => handleDelete(scan.id)}
                    disabled={isDeleting}
                    className="h-8 bg-red-600 px-3 text-xs text-white hover:bg-red-700"
                  >
                    {isDeleting ? "Deleting..." : "Delete"}
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <EditGroupDialog
        group={editingGroup}
        open={!!editingGroup}
        onOpenChange={(open) => !open && setEditingGroup(null)}
      />
    </div>
  );
}