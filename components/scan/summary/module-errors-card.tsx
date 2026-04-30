"use client";

/**
 * Top-of-page red banner that surfaces any modules whose backend job ended in
 * `failed` or `timeout`. Renders nothing when `moduleErrors` is empty so the
 * card never shows a noisy "0 errors" placeholder.
 *
 * Errors come from `ScanDetail.moduleErrors` (already aggregated by the
 * backend transformer); each row links to the corresponding module page when
 * the frontend route exists.
 */

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getModuleDetailHref } from "@/lib/constants/scan-module-routes";
import type { ModuleErrorSummary, ScanDetail } from "@/shared/types/scan";

export interface ModuleErrorsCardProps {
  detail: ScanDetail;
}

const STATUS_LABEL: Record<ModuleErrorSummary["status"], string> = {
  failed: "Failed",
  timeout: "Timed out",
};

function moduleHref(scanId: string, error: ModuleErrorSummary): string | null {
  if (error.frontendKey) {
    return getModuleDetailHref(scanId, error.frontendKey);
  }
  return getModuleDetailHref(scanId, error.module);
}

export function ModuleErrorsCard({ detail }: ModuleErrorsCardProps) {
  const errors = Object.values(detail.moduleErrors ?? {});
  if (errors.length === 0) {
    return null;
  }

  return (
    <Card
      data-testid="module-errors-card"
      className="border-2 border-red-500/60 bg-red-50/40 dark:border-red-500/50 dark:bg-red-950/30"
    >
      <CardHeader>
        <CardTitle className="text-base font-semibold text-red-800 dark:text-red-200">
          Module errors ({errors.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {errors.map((error) => {
            const href = moduleHref(detail.id, error);
            const label = (
              <span className="font-mono text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {error.module}
              </span>
            );
            return (
              <li
                key={error.module}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-red-200 bg-white p-3 dark:border-red-800/40 dark:bg-zinc-900/40"
              >
                <div className="flex flex-wrap items-center gap-2">
                  {href ? (
                    <Link
                      href={href}
                      className="text-sm font-medium text-blue-600 underline-offset-2 hover:underline dark:text-blue-400"
                    >
                      {label}
                    </Link>
                  ) : (
                    label
                  )}
                  <Badge className="border-transparent bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200">
                    {STATUS_LABEL[error.status]}
                  </Badge>
                </div>
                <p className="w-full text-xs text-zinc-700 dark:text-zinc-200 sm:flex-1">
                  {error.message}
                </p>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
