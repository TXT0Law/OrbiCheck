import { create } from "zustand";

interface MonitorStoreState {
  statusFilter: string | null;
  searchQuery: string;
  setStatusFilter: (status: string | null) => void;
  setSearchQuery: (query: string) => void;
}

export const useMonitorStore = create<MonitorStoreState>((set) => ({
  statusFilter: null,
  searchQuery: "",
  setStatusFilter: (status) => set({ statusFilter: status }),
  setSearchQuery: (query) => set({ searchQuery: query }),
}));
