"use client";

import { useToastStore } from "@/lib/stores/toast-store";

export function useToast() {
  const toast = useToastStore((s) => s.toast);
  return { toast };
}
