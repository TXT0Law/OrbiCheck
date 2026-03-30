import { create } from "zustand";

import type { ScanProgressEvent } from "@/shared/types/api";

interface ActiveScan {
  scanId: string;
  url: string;
  domain: string;
}

interface ScanStore {
  activeScan: ActiveScan | null;
  activeScanProgress: ScanProgressEvent | null;
  activeScanProgressError: string | null;
  setActiveScan: (scan: ActiveScan | null) => void;
  clearActiveScan: () => void;
  setActiveScanProgressFromStream: (event: ScanProgressEvent | null) => void;
  setActiveScanProgressStreamError: (message: string | null) => void;
}

export const useScanStore = create<ScanStore>((set) => ({
  activeScan: null,
  activeScanProgress: null,
  activeScanProgressError: null,
  setActiveScan: (scan) => set({ activeScan: scan }),
  clearActiveScan: () =>
    set({
      activeScan: null,
      activeScanProgress: null,
      activeScanProgressError: null,
    }),
  setActiveScanProgressFromStream: (event) =>
    set({ activeScanProgress: event, activeScanProgressError: null }),
  setActiveScanProgressStreamError: (message) =>
    set({ activeScanProgressError: message }),
}));
