"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScanRangeSelector } from "@/components/scan/scan-range-selector";
import { parseAndValidateUrls, parseUrls } from "@/lib/utils/url-input-sanitizer";
import { SCAN_MODULES } from "@/lib/constants/scan-modules";

interface ScanInputProps {
  onSubmit: (urls: string[], options?: { modules?: string[] }) => Promise<void>;
  selectedModules?: Set<string>;
  onModulesChange?: (modules: Set<string>) => void;
  /** Prefill textarea (e.g. from /dashboard/scan?url=…) */
  prefilledUrl?: string;
}

export function ScanInput({
  onSubmit,
  selectedModules: controlledModules,
  onModulesChange: controlledOnChange,
  prefilledUrl = "",
}: ScanInputProps) {
  const [internalModules, setInternalModules] = useState<Set<string>>(
    () => new Set(SCAN_MODULES)
  );
  const selectedModules = controlledModules ?? internalModules;
  const onModulesChange: (modules: Set<string>) => void =
    controlledOnChange ?? setInternalModules;

  const [inputValue, setInputValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    const t = prefilledUrl.trim();
    if (t) setInputValue(t);
  }, [prefilledUrl]);

  const parsedPreview = useMemo(() => {
    if (!inputValue.trim()) return { count: 0, urls: [] as string[] };
    const raw = parseUrls(inputValue);
    return { count: raw.length, urls: raw };
  }, [inputValue]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrors([]);

    const result = parseAndValidateUrls(inputValue);

    if (result.errors.length > 0) {
      setErrors(result.errors);
      return;
    }

    if (result.urls.length === 0) {
      setErrors(["Please enter at least one valid URL"]);
      return;
    }

    if (selectedModules.size === 0) {
      setErrors(["Please select at least one module to scan"]);
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(result.urls, {
        modules: Array.from(selectedModules),
      });
      setInputValue("");
      setErrors([]);
    } catch (error) {
      setErrors([
        error instanceof Error ? error.message : "Failed to start scan",
      ]);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isDisabled =
    isSubmitting || !inputValue.trim() || selectedModules.size === 0;

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <Textarea
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        placeholder="Enter URLs to scan (one per line or comma-separated)
https://example.com
https://example.org"
        rows={4}
        disabled={isSubmitting}
        className="font-mono resize-none text-sm"
        aria-label="Scan target URL"
      />

      {parsedPreview.count > 0 && (
        <p className="text-sm text-muted-foreground">
          {parsedPreview.count} URL{parsedPreview.count > 1 ? "s" : ""} detected
        </p>
      )}

      <ScanRangeSelector
        selectedModules={selectedModules}
        onChange={onModulesChange}
      />

      {errors.length > 0 && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/30">
          <ul className="list-disc space-y-1 pl-4 text-sm text-red-700 dark:text-red-200">
            {errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      <Button
        type="submit"
        disabled={isDisabled}
        className="h-14 w-full bg-zinc-900 px-6 text-base font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Starting scan...
          </>
        ) : parsedPreview.count > 1 ? (
          `Scan ${parsedPreview.count} URLs`
        ) : (
          "Start Scan"
        )}
      </Button>
    </form>
  );
}
