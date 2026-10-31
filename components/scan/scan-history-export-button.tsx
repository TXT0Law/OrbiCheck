"use client";

import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import type { ScanListSortBy, ScanStatusGroup } from "@/lib/api/scans";
import { useAppearanceLanguage } from "@/lib/hooks/use-appearance-language";
import {
  SCAN_HISTORY_EXPORT_LIMIT,
  useScanHistoryExport,
} from "@/lib/hooks/use-scan-history-export";
import { getDashboardMessages } from "@/lib/i18n/dashboard";

interface ScanHistoryExportButtonProps {
  search: string;
  sortBy: ScanListSortBy;
  statusGroup: ScanStatusGroup;
  total: number;
  disabled?: boolean;
}

export function ScanHistoryExportButton({
  search,
  sortBy,
  statusGroup,
  total,
  disabled = false,
}: ScanHistoryExportButtonProps) {
  const messages = getDashboardMessages(useAppearanceLanguage()).scan;
  const { toast } = useToast();
  const { mutateAsync: exportHistory, isPending } = useScanHistoryExport();

  async function handleExport() {
    try {
      await exportHistory({ search, sortBy, statusGroup });
    } catch (error) {
      toast({
        title: messages.exportFailed,
        description:
          error instanceof Error ? error.message : messages.exportFailedFallback,
        variant: "destructive",
      });
    }
  }

  const label = isPending
    ? messages.exportingCsv
    : total > SCAN_HISTORY_EXPORT_LIMIT
      ? messages.exportFirstCsv
      : messages.exportCsv;

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => void handleExport()}
      disabled={disabled || isPending || total === 0}
      className="gap-1.5"
    >
      <Download className="h-4 w-4" aria-hidden="true" />
      {label}
    </Button>
  );
}
