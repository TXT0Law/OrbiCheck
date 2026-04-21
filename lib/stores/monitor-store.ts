import { create } from "zustand";

import type {
  MonitorListSort,
  MonitorTagMatch,
} from "@/shared/types/monitor";

// Inline tag normalization keeps `lib/AGENTS.md` happy — `lib/stores/` is
// only allowed to import from `lib/api/` or `shared/`. Mirror the rules in
// `lib/utils/monitor-tags.ts`; if those rules change, update both.
const TAG_MAX_LENGTH = 50;
function dedupeMonitorTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    if (typeof raw !== "string") continue;
    const norm = raw.trim().toLowerCase().replace(/\s+/g, " ").slice(0, TAG_MAX_LENGTH);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    out.push(norm);
  }
  return out;
}

interface MonitorStoreState {
  statusFilter: string | null;
  searchQuery: string;
  setStatusFilter: (status: string | null) => void;
  setSearchQuery: (query: string) => void;

  // Phase 1.2: bulk-selection slice. Lives on the store so the action bar and
  // the table row checkbox column can share state without prop-drilling, and
  // so SSE-triggered list refetches can prune ids that no longer exist.
  selectedMonitorIds: string[];
  toggleMonitorSelection: (id: string) => void;
  selectMonitors: (ids: string[]) => void;
  deselectMonitors: (ids: string[]) => void;
  clearMonitorSelection: () => void;
  setSelectedMonitorIds: (ids: string[]) => void;

  // Phase 1.3 / 1.4: advanced list filters and sort.
  tagFilters: string[];
  tagMatch: MonitorTagMatch;
  latencyMaxMs: number | null;
  uptimeMinPercent: number | null;
  sort: MonitorListSort | null;
  setTagFilters: (tags: string[]) => void;
  setTagMatch: (match: MonitorTagMatch) => void;
  setLatencyMaxMs: (value: number | null) => void;
  setUptimeMinPercent: (value: number | null) => void;
  setSort: (sort: MonitorListSort | null) => void;
  resetAdvancedFilters: () => void;
}

function uniqueIds(ids: string[]): string[] {
  return Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
}

export const useMonitorStore = create<MonitorStoreState>((set) => ({
  statusFilter: null,
  searchQuery: "",
  setStatusFilter: (status) => set({ statusFilter: status }),
  setSearchQuery: (query) => set({ searchQuery: query }),

  selectedMonitorIds: [],
  toggleMonitorSelection: (id) =>
    set((state) => {
      const trimmed = id.trim();
      if (!trimmed) return state;
      const exists = state.selectedMonitorIds.includes(trimmed);
      return {
        selectedMonitorIds: exists
          ? state.selectedMonitorIds.filter((x) => x !== trimmed)
          : [...state.selectedMonitorIds, trimmed],
      };
    }),
  selectMonitors: (ids) =>
    set((state) => ({
      selectedMonitorIds: uniqueIds([...state.selectedMonitorIds, ...ids]),
    })),
  deselectMonitors: (ids) =>
    set((state) => {
      const drop = new Set(ids.map((id) => id.trim()).filter(Boolean));
      return {
        selectedMonitorIds: state.selectedMonitorIds.filter((x) => !drop.has(x)),
      };
    }),
  clearMonitorSelection: () => set({ selectedMonitorIds: [] }),
  setSelectedMonitorIds: (ids) => set({ selectedMonitorIds: uniqueIds(ids) }),

  tagFilters: [],
  tagMatch: "any",
  latencyMaxMs: null,
  uptimeMinPercent: null,
  sort: null,
  setTagFilters: (tags) => set({ tagFilters: dedupeMonitorTags(tags) }),
  setTagMatch: (match) => set({ tagMatch: match }),
  setLatencyMaxMs: (value) =>
    set({
      latencyMaxMs:
        value == null || Number.isNaN(value) || value < 0 ? null : value,
    }),
  setUptimeMinPercent: (value) =>
    set({
      uptimeMinPercent:
        value == null || Number.isNaN(value) || value < 0
          ? null
          : Math.min(100, value),
    }),
  setSort: (sort) => set({ sort }),
  resetAdvancedFilters: () =>
    set({
      tagFilters: [],
      tagMatch: "any",
      latencyMaxMs: null,
      uptimeMinPercent: null,
      sort: null,
    }),
}));
