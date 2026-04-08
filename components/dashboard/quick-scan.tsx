"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createScan } from "@/lib/api/scans";
import { parseAndValidateUrls } from "@/lib/utils/url-input-sanitizer";

interface QuickScanProps {
  className?: string;
}

export function QuickScan({ className }: QuickScanProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (targetUrl: string) =>
      createScan(targetUrl, {
        enablePortScan: true,
        portScanProfile: "quick",
        acknowledgeScanAuthorization: true,
      }),
    onSuccess: (scan) => {
      void queryClient.invalidateQueries({ queryKey: ["scans"] });
      router.push(`/dashboard/scan/${scan.id}`);
    },
  });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const result = parseAndValidateUrls(url, 1);
    if (result.errors.length > 0 || result.urls.length === 0) {
      setError(result.errors[0] ?? "Please enter a valid URL");
      return;
    }

    try {
      await mutation.mutateAsync(result.urls[0]!);
      setUrl("");
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Failed to start scan"
      );
    }
  }

  return (
    <Card className={className}>
      <CardHeader className="space-y-2">
        <CardTitle className="text-lg font-semibold">Quick Scan</CardTitle>
        <p className="text-sm text-muted-foreground">
          Launch a full scan from the dashboard.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://example.com"
              className="h-11 pl-9 font-mono"
              aria-label="Quick scan URL"
              disabled={mutation.isPending}
            />
          </div>
          <Button
            type="submit"
            className="h-11 min-w-28"
            disabled={mutation.isPending || !url.trim()}
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Scanning...
              </>
            ) : (
              "Scan"
            )}
          </Button>
        </form>

        {error ? (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
