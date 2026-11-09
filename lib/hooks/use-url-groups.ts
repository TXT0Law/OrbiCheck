import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  addGroupMember,
  cancelGroupRun,
  createGroup,
  createGroupRun,
  deleteGroup,
  getGroup,
  getGroupRun,
  listGroupRuns,
  parseGroupRunProgress,
  listGroups,
  removeGroupMember,
  retryFailedGroupRun,
  updateGroup,
} from "@/lib/api/url-groups";
import type {
  UrlGroupCreateInput,
  UrlGroupMemberAddInput,
  UrlGroupRun,
  UrlGroupRunCreateInput,
  UrlGroupUpdateInput,
} from "@/types/url-group";
import { useEffect, useState } from "react";
import { ZodError } from "zod";

const GROUP_RUN_REFRESH_INTERVAL_MS = 3000;
const ACTIVE_GROUP_RUN_STATUSES = ["pending", "running"];

export function useUrlGroups(skip?: number, limit?: number, search?: string) {
  return useQuery({
    queryKey: ["url-groups", skip ?? 0, limit ?? 50, search?.trim() ?? ""],
    queryFn: () => listGroups(skip, limit, search?.trim()),
  });
}

export function useUrlGroup(groupId: string) {
  return useQuery({
    queryKey: ["url-groups", groupId],
    queryFn: () => getGroup(groupId),
    enabled: !!groupId,
  });
}

export function useCreateGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UrlGroupCreateInput) => createGroup(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["url-groups"] });
    },
  });
}

export function useUpdateGroup(groupId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UrlGroupUpdateInput) => updateGroup(groupId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["url-groups"] });
      queryClient.invalidateQueries({ queryKey: ["url-groups", groupId] });
    },
  });
}

export function useDeleteGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (groupId: string) => deleteGroup(groupId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["url-groups"] });
    },
  });
}

export function useAddGroupMember(groupId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UrlGroupMemberAddInput) =>
      addGroupMember(groupId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["url-groups"] });
      queryClient.invalidateQueries({ queryKey: ["url-groups", groupId] });
    },
  });
}

export function useRemoveGroupMember(groupId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (memberId: string) =>
      removeGroupMember(groupId, memberId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["url-groups", groupId] });
    },
  });
}

export function useGroupRuns(groupId: string, skip?: number, limit?: number) {
  return useQuery({
    queryKey: ["url-group-runs", groupId, skip ?? 0, limit ?? 10],
    queryFn: () => listGroupRuns(groupId, skip, limit),
    refetchInterval: (query) =>
      query.state.data?.runs.some((run) => ACTIVE_GROUP_RUN_STATUSES.includes(run.status))
        ? GROUP_RUN_REFRESH_INTERVAL_MS
        : false,
    enabled: !!groupId,
  });
}

export function useGroupRun(groupId: string, runId: string) {
  return useQuery({
    queryKey: ["url-group-runs", groupId, runId],
    queryFn: () => getGroupRun(groupId, runId),
    enabled: !!groupId && !!runId,
  });
}

export function useCreateGroupRun(groupId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UrlGroupRunCreateInput) => createGroupRun(groupId, input),
    onSuccess: (run) => {
      queryClient.invalidateQueries({ queryKey: ["url-group-runs", groupId] });
      queryClient.setQueryData(["url-group-runs", groupId, run.id], run);
      queryClient.invalidateQueries({ queryKey: ["url-groups", groupId] });
    },
  });
}

export function useCancelGroupRun(groupId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (runId: string) => cancelGroupRun(groupId, runId),
    onSuccess: (run) => {
      queryClient.invalidateQueries({ queryKey: ["url-group-runs", groupId] });
      queryClient.setQueryData(["url-group-runs", groupId, run.id], run);
    },
  });
}

export function useRetryFailedGroupRun(groupId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      runId,
      input,
    }: {
      runId: string;
      input?: UrlGroupRunCreateInput;
    }) => retryFailedGroupRun(groupId, runId, input ?? {}),
    onSuccess: (run) => {
      queryClient.invalidateQueries({ queryKey: ["url-group-runs", groupId] });
      queryClient.setQueryData(["url-group-runs", groupId, run.id], run);
    },
  });
}

export function useGroupRunProgress(
  groupId: string,
  runId: string,
  enabled: boolean
) {
  const [progress, setProgress] = useState<UrlGroupRun | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    setProgress(null);
    let active = true;
    if (!enabled || !groupId || !runId || typeof EventSource === "undefined") {
      return;
    }

    const eventSource = new EventSource(
      `/api/v1/url-groups/${groupId}/runs/${runId}/progress`,
      { withCredentials: true }
    );

    eventSource.onmessage = (event) => {
      if (!active) return;
      let raw: unknown;
      try {
        raw = JSON.parse(event.data) as unknown;
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
        return;
      }
      if (
        typeof raw === "object" &&
        raw !== null &&
        "done" in raw &&
        raw.done === true
      ) {
        active = false;
        setProgress(null);
        eventSource.close();
        queryClient.invalidateQueries({ queryKey: ["url-group-runs", groupId] });
        return;
      }
      let parsed: UrlGroupRun;
      try {
        parsed = parseGroupRunProgress(raw);
      } catch (error) {
        if (!(error instanceof ZodError)) throw error;
        return;
      }
      if (parsed.id !== runId || parsed.groupId !== groupId) return;
      setProgress(parsed);
      queryClient.setQueryData(["url-group-runs", groupId, runId], parsed);
    };

    eventSource.onerror = () => {
      if (!active) return;
      active = false;
      setProgress(null);
      eventSource.close();
      queryClient.invalidateQueries({ queryKey: ["url-group-runs", groupId] });
    };

    return () => {
      active = false;
      eventSource.close();
    };
  }, [enabled, groupId, queryClient, runId]);

  return enabled && progress?.id === runId && progress.groupId === groupId
    ? progress
    : null;
}
