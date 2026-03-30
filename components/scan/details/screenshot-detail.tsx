"use client";

import { useState, useCallback } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CopyButton } from "@/components/common/copy-button";
import type { ScreenshotResult, PageSourceResult } from "@/shared/types/scan";

const PREVIEW_LINE_COUNT = 50;
const PREVIEW_CHAR_LIMIT = 3000;

interface ScreenshotDetailProps {
  screenshot?: ScreenshotResult | null;
  pageSource?: PageSourceResult | null;
  isLoading?: boolean;
}

/** @deprecated Use screenshot and pageSource props. Kept for backward compatibility. */
interface LegacyScreenshotDetailProps {
  data?: ScreenshotResult | null;
}

export function ScreenshotDetail(
  props: ScreenshotDetailProps | LegacyScreenshotDetailProps
) {
  const screenshot =
    "data" in props ? props.data : (props as ScreenshotDetailProps).screenshot;
  const pageSource =
    "data" in props ? null : (props as ScreenshotDetailProps).pageSource;
  const isLoading =
    "data" in props ? false : ((props as ScreenshotDetailProps).isLoading ?? false);

  const [isExpanded, setIsExpanded] = useState(false);

  const hasScreenshot = Boolean(screenshot?.imageUrl);
  const hasPageSource = Boolean(pageSource?.html);

  const previewHtml = useCallback(() => {
    if (!pageSource?.html) return "";
    const lines = pageSource.html.split("\n");
    const preview = lines.slice(0, PREVIEW_LINE_COUNT).join("\n");
    return preview.slice(0, PREVIEW_CHAR_LIMIT);
  }, [pageSource?.html]);

  const needsExpansion = useCallback(() => {
    if (!pageSource?.html) return false;
    const lineCount = pageSource.html.split("\n").length;
    return (
      lineCount > PREVIEW_LINE_COUNT ||
      pageSource.html.length > PREVIEW_CHAR_LIMIT
    );
  }, [pageSource?.html]);

  if (isLoading) {
    return <ScreenshotDetailSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Screenshot Section */}
      <Card id="screenshot">
        <CardHeader>
          <CardTitle className="text-lg">Captured Screenshot</CardTitle>
        </CardHeader>
        <CardContent>
          {hasScreenshot ? (
            <div className="space-y-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={screenshot!.imageUrl}
                alt="Scan capture"
                className="w-full rounded-lg border shadow-sm"
              />
              {screenshot!.viewport && (
                <p className="text-sm text-muted-foreground">
                  Viewport: {screenshot!.viewport}
                </p>
              )}
              {screenshot!.capturedAt && (
                <p className="text-sm text-muted-foreground">
                  Captured: {screenshot!.capturedAt}
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-12">
              <p className="text-center text-muted-foreground">
                Screenshot is unavailable for this scan.
              </p>
              {screenshot?.unavailableReason && (
                <p className="text-center text-sm text-muted-foreground">
                  {screenshot.unavailableReason}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Page Source Section — anchor for /screenshot#page-source */}
      <Card id="page-source" className="scroll-mt-24">
        <CardHeader className="space-y-3">
          <div className="flex flex-row flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-lg">Page Source (HTML)</CardTitle>
            {hasPageSource && (
              <CopyButton text={pageSource!.html} label="Copy source" />
            )}
          </div>
          {hasPageSource && (
            <div className="flex flex-wrap items-center gap-2">
              {pageSource!.statusCode != null && (
                <Badge variant="outline">HTTP {pageSource!.statusCode}</Badge>
              )}
              {pageSource!.contentType && (
                <Badge variant="secondary">
                  {pageSource!.contentType.split(";")[0]}
                </Badge>
              )}
              <span className="text-sm text-muted-foreground">
                {formatBytes(pageSource!.contentLength)}
              </span>
              {pageSource!.truncated && (
                <Badge variant="destructive">Truncated</Badge>
              )}
            </div>
          )}
        </CardHeader>
        <CardContent>
          {hasPageSource ? (
            <div className="space-y-3">
              <pre className="max-h-[600px] overflow-auto rounded-lg bg-muted p-4 text-xs leading-relaxed">
                <code>
                  {isExpanded ? pageSource!.html : previewHtml()}
                </code>
              </pre>
              {needsExpansion() && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="w-full"
                >
                  {isExpanded ? "Show less ▲" : "Show more ▼"}
                </Button>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-8">
              <p className="text-center text-muted-foreground">
                Page source is unavailable for this scan.
              </p>
              {pageSource?.unavailableReason && (
                <p className="text-center text-sm text-muted-foreground">
                  {pageSource.unavailableReason}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ScreenshotDetailSkeleton() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-48 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB"];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / Math.pow(k, i);
  return `${value.toFixed(1)} ${units[i] ?? "B"}`;
}
