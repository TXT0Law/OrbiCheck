"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScanRangeSelector } from "@/components/scan/scan-range-selector";
import { useAppearanceLanguage } from "@/lib/hooks/use-appearance-language";
import { parseAndValidateUrls, parseUrls } from "@/lib/utils/url-input-sanitizer";
import { SCAN_MODULES } from "@/lib/constants/scan-modules";
import { getDashboardMessages } from "@/lib/i18n/dashboard";

const PORTS_MODULE = "ports";
const PORT_SCAN_PROFILES = ["quick", "standard", "deep"] as const;

interface ScanInputProps {
  onSubmit: (
    urls: string[],
    options?: {
      modules?: string[];
      enablePortScan?: boolean;
      portScanProfile?: "quick" | "standard" | "deep";
      acknowledgeScanAuthorization?: boolean;
    }
  ) => Promise<void>;
  selectedModules?: Set<string>;
  onModulesChange?: (modules: Set<string>) => void;
  enablePortScan?: boolean;
  onEnablePortScanChange?: (enabled: boolean) => void;
  portScanProfile?: "quick" | "standard" | "deep";
  onPortScanProfileChange?: (
    profile: "quick" | "standard" | "deep"
  ) => void;
  acknowledgeScanAuthorization?: boolean;
  onAcknowledgeScanAuthorizationChange?: (acknowledged: boolean) => void;
  /** Prefill textarea (e.g. from /dashboard/scan?url=…) */
  prefilledUrl?: string;
}

export function ScanInput({
  onSubmit,
  selectedModules: controlledModules,
  onModulesChange: controlledOnChange,
  enablePortScan: controlledEnablePortScan,
  onEnablePortScanChange: controlledOnEnablePortScanChange,
  portScanProfile: controlledPortScanProfile,
  onPortScanProfileChange: controlledOnPortScanProfileChange,
  acknowledgeScanAuthorization: controlledAcknowledgeScanAuthorization,
  onAcknowledgeScanAuthorizationChange:
    controlledOnAcknowledgeScanAuthorizationChange,
  prefilledUrl = "",
}: ScanInputProps) {
  const language = useAppearanceLanguage();
  const messages = getDashboardMessages(language).scan;
  const [internalModules, setInternalModules] = useState<Set<string>>(
    () => new Set(SCAN_MODULES)
  );
  const [internalEnablePortScan, setInternalEnablePortScan] = useState(true);
  const [internalPortScanProfile, setInternalPortScanProfile] = useState<
    "quick" | "standard" | "deep"
  >("quick");
  const [internalAcknowledgeScanAuthorization, setInternalAcknowledgeScanAuthorization] =
    useState(false);
  const selectedModules = controlledModules ?? internalModules;
  const onModulesChange: (modules: Set<string>) => void =
    controlledOnChange ?? setInternalModules;
  const enablePortScan = controlledEnablePortScan ?? internalEnablePortScan;
  const onEnablePortScanChange: (enabled: boolean) => void =
    controlledOnEnablePortScanChange ?? setInternalEnablePortScan;
  const portScanProfile = controlledPortScanProfile ?? internalPortScanProfile;
  const onPortScanProfileChange:
    (profile: "quick" | "standard" | "deep") => void =
      controlledOnPortScanProfileChange ?? setInternalPortScanProfile;
  const acknowledgeScanAuthorization =
    controlledAcknowledgeScanAuthorization ?? internalAcknowledgeScanAuthorization;
  const onAcknowledgeScanAuthorizationChange: (acknowledged: boolean) => void =
    controlledOnAcknowledgeScanAuthorizationChange
    ?? setInternalAcknowledgeScanAuthorization;

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
      setErrors([messages.urlRequired]);
      return;
    }

    if (selectedModules.size === 0) {
      setErrors([messages.moduleRequired]);
      return;
    }

    if (enablePortScan && !acknowledgeScanAuthorization) {
      setErrors([messages.authorizationRequired]);
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(result.urls, {
        modules: Array.from(selectedModules),
        enablePortScan,
        portScanProfile,
        acknowledgeScanAuthorization,
      });
      setInputValue("");
      setErrors([]);
    } catch (error) {
      setErrors([
        error instanceof Error ? error.message : messages.startFailedGeneric,
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
        placeholder={messages.inputPlaceholder}
        rows={4}
        disabled={isSubmitting}
        className="font-mono resize-none text-sm"
        aria-label="Scan target URL"
      />

      {parsedPreview.count > 0 && (
        <p className="text-sm text-muted-foreground">
          {messages.urlsDetected(parsedPreview.count)}
        </p>
      )}

      <ScanRangeSelector
        selectedModules={selectedModules}
        onChange={onModulesChange}
        disabledModules={
          enablePortScan ? new Set() : new Set([PORTS_MODULE])
        }
      />

      <div className="space-y-2 rounded-md border border-zinc-300 bg-zinc-50 p-4 dark:border-zinc-600 dark:bg-zinc-800/40">
        <label className="flex cursor-pointer items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {messages.portScanning}
              </span>
              <Badge
                variant="outline"
                className="border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300"
              >
                {messages.authorizationBadge}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {messages.portDescription}
            </p>
          </div>
          <input
            type="checkbox"
            role="switch"
            aria-label="Port Scanning"
            checked={enablePortScan}
            onChange={(event) => onEnablePortScanChange(event.target.checked)}
            className="mt-1 h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
          />
        </label>
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          {messages.permissionNotice}
        </p>
        {enablePortScan ? (
          <div className="space-y-3">
            <label className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {messages.scanDepth}
            </label>
            <select
              aria-label={messages.portScanDepthAria}
              value={portScanProfile}
              onChange={(event) =>
                onPortScanProfileChange(
                  event.target.value as "quick" | "standard" | "deep"
                )
              }
              className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            >
              {PORT_SCAN_PROFILES.map((profile) => (
                <option key={profile} value={profile}>
                  {profile[0]!.toUpperCase() + profile.slice(1)}
                </option>
              ))}
            </select>

            <label className="flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={acknowledgeScanAuthorization}
                onChange={(event) =>
                  onAcknowledgeScanAuthorizationChange(event.target.checked)
                }
                className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              />
              <span>
                {messages.authorizationConfirm}
              </span>
            </label>
          </div>
        ) : null}
      </div>

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
            {messages.startingScan}
          </>
        ) : parsedPreview.count > 1 ? (
          messages.scanUrls(parsedPreview.count)
        ) : (
          messages.startScan
        )}
      </Button>
    </form>
  );
}
