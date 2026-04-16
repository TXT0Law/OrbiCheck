"use client";

import { useCallback, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  MODULE_BATCHES,
  SCAN_MODULE_LABELS,
  SCAN_MODULES,
} from "@/lib/constants/scan-modules";

interface ScanRangeSelectorProps {
  selectedModules: Set<string>;
  onChange: (modules: Set<string>) => void;
  disabledModules?: Set<string>;
}

export function ScanRangeSelector({
  selectedModules,
  onChange,
  disabledModules = new Set(),
}: ScanRangeSelectorProps) {
  const selectableModules = SCAN_MODULES.filter(
    (moduleId) => !disabledModules.has(moduleId)
  );
  const totalCount = selectableModules.length;
  const selectedCount = selectedModules.size;

  const toggleModule = useCallback(
    (moduleId: string) => {
      if (disabledModules.has(moduleId)) {
        return;
      }
      const next = new Set(selectedModules);
      if (next.has(moduleId)) {
        next.delete(moduleId);
      } else {
        next.add(moduleId);
      }
      onChange(next);
    },
    [disabledModules, selectedModules, onChange]
  );

  const selectAll = useCallback(() => {
    onChange(new Set(selectableModules));
  }, [onChange, selectableModules]);

  const deselectAll = useCallback(() => {
    onChange(new Set());
  }, [onChange]);

  const selectBatch = useCallback(
    (batch: readonly string[]) => {
      const next = new Set(selectedModules);
      for (const m of batch) {
        if (disabledModules.has(m)) {
          continue;
        }
        next.add(m);
      }
      onChange(next);
    },
    [disabledModules, selectedModules, onChange]
  );

  const deselectBatch = useCallback(
    (batch: readonly string[]) => {
      const next = new Set(selectedModules);
      for (const m of batch) {
        next.delete(m);
      }
      onChange(next);
    },
    [selectedModules, onChange]
  );

  const [isOpen, setIsOpen] = useState(false);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="rounded-md border border-zinc-300 bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800/40">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left transition hover:bg-zinc-100 dark:hover:bg-zinc-700/30"
          >
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
              Scan range: {selectedCount} of {totalCount} modules selected
            </span>
            <span className="text-muted-foreground">
              {isOpen ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </span>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t border-zinc-300 px-4 py-3 dark:border-zinc-600">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={selectAll}
                className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
              >
                Select All
              </button>
              <button
                type="button"
                onClick={deselectAll}
                className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
              >
                Deselect All
              </button>
            </div>

            <div className="space-y-4">
              {(["quick", "medium", "heavy"] as const).map((batchName) => {
                const batch = MODULE_BATCHES[batchName];
                const label =
                  batchName === "quick"
                    ? "Quick"
                    : batchName === "medium"
                      ? "Medium"
                      : "Heavy";
                const batchSelectable = batch.filter(
                  (moduleId) => !disabledModules.has(moduleId)
                );
                const batchSelected = batchSelectable.filter((m) =>
                  selectedModules.has(m)
                );
                return (
                  <div key={batchName}>
                    <div className="mb-2 flex items-center gap-2">
                      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {label}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          batchSelected.length === batchSelectable.length
                            ? deselectBatch(batchSelectable)
                            : selectBatch(batchSelectable)
                        }
                        disabled={batchSelectable.length === 0}
                        className="text-xs text-zinc-600 hover:underline dark:text-zinc-300"
                      >
                        {batchSelected.length === batchSelectable.length
                          ? "Deselect all"
                          : "Select all"}
                      </button>
                    </div>
                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 md:grid-cols-3">
                      {batch.map((moduleId) => (
                        <label
                          key={moduleId}
                          className={`flex items-center gap-2 rounded py-1 text-sm ${
                            disabledModules.has(moduleId)
                              ? "cursor-not-allowed text-zinc-400 dark:text-zinc-500"
                              : "cursor-pointer text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-700/50"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selectedModules.has(moduleId)}
                            onChange={() => toggleModule(moduleId)}
                            disabled={disabledModules.has(moduleId)}
                            className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                          />
                          <span>
                            {SCAN_MODULE_LABELS[moduleId] ?? moduleId}
                            {disabledModules.has(moduleId)
                              ? " (enable Port Scanning first)"
                              : ""}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
