"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { MonitorUpdateRequest } from "@/shared/types/monitor";

interface MonitorSettingsPreviewProps {
  pendingChanges: MonitorUpdateRequest;
  checkAfterSave: boolean;
  onCheckAfterSaveChange: (checked: boolean) => void;
}

export function MonitorSettingsPreview({
  pendingChanges,
  checkAfterSave,
  onCheckAfterSaveChange,
}: MonitorSettingsPreviewProps) {
  const changeEntries = Object.entries(pendingChanges).filter(([, v]) => v !== undefined);

  return (
    <div className="space-y-3">
      {changeEntries.length > 0 ? (
        <Card className="border-sky-200 bg-sky-50/50 dark:border-sky-900 dark:bg-sky-950/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-zinc-900 dark:text-white">Changes to be saved</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="space-y-1.5 text-sm text-zinc-800 dark:text-zinc-200">
              {changeEntries.map(([key, value]) => (
                <li key={key} className="flex items-start gap-2">
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">{key}:</span>
                  <span className="min-w-0 break-all">
                    {typeof value === "object" && value !== null
                      ? `${JSON.stringify(value).slice(0, 120)}${JSON.stringify(value).length > 120 ? "…" : ""}`
                      : String(value)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-800 dark:text-zinc-200">
        <input
          type="checkbox"
          checked={checkAfterSave}
          onChange={(e) => onCheckAfterSaveChange(e.target.checked)}
          className="h-4 w-4 rounded border-zinc-400 dark:border-zinc-500"
        />
        Run a check immediately after saving
      </label>
    </div>
  );
}
