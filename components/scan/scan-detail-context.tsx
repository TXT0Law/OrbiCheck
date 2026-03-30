"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { ScanDetail } from "@/shared/types/scan";

export interface ScanDetailContextValue {
  scanId: string;
  detail: ScanDetail;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  isNotFound: boolean;
  isFetching: boolean;
  refetch: () => void;
}

const ScanDetailContext = createContext<ScanDetailContextValue | null>(null);

export interface ScanDetailProviderProps {
  value: ScanDetailContextValue;
  children: ReactNode;
}

export function ScanDetailProvider({ value, children }: ScanDetailProviderProps) {
  return <ScanDetailContext.Provider value={value}>{children}</ScanDetailContext.Provider>;
}

export function useScanDetailContext(): ScanDetailContextValue {
  const ctx = useContext(ScanDetailContext);
  if (!ctx) {
    throw new Error("useScanDetailContext must be used within ScanDetailProvider");
  }
  return ctx;
}
