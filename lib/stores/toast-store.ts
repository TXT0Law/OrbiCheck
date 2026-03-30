import type { ReactNode } from "react";
import { create } from "zustand";

const TOAST_DURATION_MS = 4500;

export interface ToastPayload {
  title: ReactNode;
  description?: ReactNode;
  variant?: "default" | "destructive";
  className?: string;
  duration?: number | null;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ToastItem extends ToastPayload {
  id: string;
}

interface ToastStoreState {
  toasts: ToastItem[];
  toast: (payload: ToastPayload) => void;
  dismiss: (id: string) => void;
}

export const useToastStore = create<ToastStoreState>((set, get) => ({
  toasts: [],
  toast: (payload) => {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `toast-${Date.now()}`;
    set((s) => ({ toasts: [...s.toasts, { ...payload, id }] }));
    const duration = payload.duration ?? TOAST_DURATION_MS;
    if (duration !== null) {
      window.setTimeout(() => {
        get().dismiss(id);
      }, duration);
    }
  },
  dismiss: (id) =>
    set((s) => ({
      toasts: s.toasts.filter((t) => t.id !== id),
    })),
}));
