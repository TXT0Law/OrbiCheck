"use client";

import { Trash2 } from "lucide-react";
import { useId } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { VisualIgnoreRegion } from "@/shared/types/monitor";

interface MonitorVisualMaskEditorProps {
  regions: VisualIgnoreRegion[];
  onChange: (regions: VisualIgnoreRegion[]) => void;
  maxRegions: number;
}

// V-11: keep the mask editor input lightweight — operators usually just
// want to type four numbers. A drag-on-canvas UI is a follow-up; the
// numeric form is enough to unblock the perceptual-hash false-positive
// cases (timers, ads, chat widgets).
const PCT_MIN = 0;
const PCT_MAX = 100;
const DEFAULT_NEW_REGION: VisualIgnoreRegion = {
  x: 25,
  y: 25,
  width: 25,
  height: 25,
};

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(PCT_MIN, Math.min(PCT_MAX, value));
}

function regionWithUpdate(
  region: VisualIgnoreRegion,
  key: keyof VisualIgnoreRegion,
  value: number,
): VisualIgnoreRegion {
  return { ...region, [key]: clampPercent(value) };
}

export function MonitorVisualMaskEditor({
  regions,
  onChange,
  maxRegions,
}: MonitorVisualMaskEditorProps) {
  const baseId = useId();
  const list = regions ?? [];
  const canAdd = list.length < maxRegions;

  const updateAt = (index: number, next: VisualIgnoreRegion) => {
    const copy = [...list];
    copy[index] = next;
    onChange(copy);
  };

  const removeAt = (index: number) => {
    const copy = list.filter((_, i) => i !== index);
    onChange(copy);
  };

  const addRegion = () => {
    if (!canAdd) return;
    onChange([...list, { ...DEFAULT_NEW_REGION }]);
  };

  return (
    <div className="space-y-3" data-testid="monitor-visual-mask-editor">
      {list.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No ignore regions configured. Add one to mask a dynamic area of the page.
        </p>
      )}
      {list.map((region, index) => (
        <div
          key={`${baseId}-region-${index}`}
          className="grid grid-cols-[1fr_auto] items-end gap-3 rounded-md border border-zinc-200 p-2 dark:border-zinc-800"
        >
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(["x", "y", "width", "height"] as const).map((key) => (
              <label key={key} className="flex flex-col gap-1 text-xs">
                <span className="capitalize text-muted-foreground">
                  {key} %
                </span>
                <Input
                  inputMode="decimal"
                  value={String(region[key])}
                  data-testid={`mask-region-${index}-${key}`}
                  onChange={(e) => {
                    const numeric = Number(e.target.value);
                    if (Number.isNaN(numeric)) {
                      updateAt(index, regionWithUpdate(region, key, 0));
                      return;
                    }
                    updateAt(index, regionWithUpdate(region, key, numeric));
                  }}
                />
              </label>
            ))}
          </div>
          <Button
            type="button"
            onClick={() => removeAt(index)}
            data-testid={`mask-region-${index}-remove`}
            className="h-9 bg-transparent px-2 text-muted-foreground hover:bg-zinc-100 hover:text-rose-600 dark:hover:bg-zinc-900 dark:hover:text-rose-400"
            title="Remove this ignore region"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Capacity: {list.length}/{maxRegions}
        </p>
        <Button
          type="button"
          onClick={addRegion}
          disabled={!canAdd}
          data-testid="mask-add-region"
          className="h-8 px-3 text-sm"
        >
          Add region
        </Button>
      </div>
    </div>
  );
}
