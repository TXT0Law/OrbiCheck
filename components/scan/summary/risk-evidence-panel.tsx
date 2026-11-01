"use client";

import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { useScanFindingEvidence } from "@/lib/hooks/use-scan-finding-evidence";

export interface RiskEvidencePanelProps {
  scanId: string;
  ruleId: string;
  scanStartedAt: string | null;
}

export function RiskEvidencePanel({ scanId, ruleId, scanStartedAt }: RiskEvidencePanelProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const query = useScanFindingEvidence(scanId, ruleId, scanStartedAt, open);

  return (
    <div className="mt-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? "Hide raw evidence" : "Show raw evidence"}
      </Button>
      {open ? (
        <div id={panelId} className="mt-2 space-y-2 text-xs">
          <p className="text-muted-foreground">Stored module output may contain sensitive data. Review it before sharing.</p>
          {query.isFetching ? <p role="status">Loading raw evidence…</p> : null}
          {query.isError ? <p role="alert">Raw evidence could not be loaded. This does not indicate resolution.</p> : null}
          {!query.isFetching && !query.isError ? query.data?.sources.map((source) => (
            <div key={source.moduleName} className="rounded-md border border-zinc-200 p-2 dark:border-zinc-800">
              <h5 className="font-medium text-zinc-900 dark:text-zinc-100">{source.moduleName}</h5>
              {source.status === "available" && source.rawResult !== null ? (
                <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap break-all rounded bg-zinc-50 p-2 text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
                  {JSON.stringify(source.rawResult, null, 2)}
                </pre>
              ) : source.status === "too_large" ? (
                <p>Raw output exceeds the preview limit. Use Export full (JSON) above for the complete result.</p>
              ) : (
                <p>Raw output is unavailable for this module. Missing evidence does not mean the risk is fixed.</p>
              )}
            </div>
          )) : null}
        </div>
      ) : null}
    </div>
  );
}
