"use client";

import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { Toaster } from "@/components/ui/toaster";
import {
  getGlobalErrorToast,
  getGlobalErrorToastSignature,
  shouldEmitGlobalErrorToast,
  shouldShowQueryErrorToast,
  shouldSuppressGlobalErrorToast,
} from "@/lib/query-error-handling";
import { useAppearanceLanguage } from "@/lib/hooks/use-appearance-language";
import { useToastStore } from "@/lib/stores/toast-store";

const globalErrorToastLastShownAt = new Map<string, number>();

function toastGlobalError(error: unknown) {
  const toast = getGlobalErrorToast(error);
  const signature = getGlobalErrorToastSignature(toast);
  const now = Date.now();
  if (!shouldEmitGlobalErrorToast(signature, globalErrorToastLastShownAt.get(signature), now)) {
    return;
  }
  globalErrorToastLastShownAt.set(signature, now);
  useToastStore.getState().toast({
    ...toast,
    variant: "destructive",
  });
}

function HtmlLanguageSync() {
  const language = useAppearanceLanguage();

  useEffect(() => {
    document.documentElement.lang = language === "zh" ? "zh-TW" : "en";
  }, [language]);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({
          onError: (error, query) => {
            if (
              shouldSuppressGlobalErrorToast(query.meta) ||
              !shouldShowQueryErrorToast(query.state.data !== undefined)
            ) {
              return;
            }
            toastGlobalError(error);
          },
        }),
        mutationCache: new MutationCache({
          onError: (error, _variables, _context, mutation) => {
            if (shouldSuppressGlobalErrorToast(mutation.options.meta)) {
              return;
            }
            const toastCountBeforeLocalHandlers = useToastStore.getState().toasts.length;
            window.setTimeout(() => {
              const store = useToastStore.getState();
              if (store.toasts.length !== toastCountBeforeLocalHandlers) {
                return;
              }
              toastGlobalError(error);
            }, 0);
          },
        }),
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <HtmlLanguageSync />
      {children}
      <Toaster />
    </QueryClientProvider>
  );
}
