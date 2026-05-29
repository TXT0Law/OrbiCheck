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

export function useUrlGroups(skip?: number, limit?: number) {
  return useQuery({
    queryKey: ["url-groups", skip ?? 0, limit ?? 50],
    queryFn: () => listGroups(skip, limit),
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
    if (!enabled || !groupId || !runId || typeof EventSource === "undefined") {
      return;
    }

    const eventSource = new EventSource(
      `/api/v1/url-groups/${groupId}/runs/${runId}/progress`,
      { withCredentials: true }
    );

    eventSource.onmessage = (event) => {
      const raw = JSON.parse(event.data) as unknown;
      if (
        typeof raw === "object" &&
        raw !== null &&
        "done" in raw &&
        raw.done === true
      ) {
        eventSource.close();
        queryClient.invalidateQueries({ queryKey: ["url-group-runs", groupId] });
        return;
      }
      const parsed = parseGroupRunProgress(raw);
      setProgress(parsed);
      queryClient.setQueryData(["url-group-runs", groupId, runId], parsed);
    };

    eventSource.onerror = () => {
      eventSource.close();
      queryClient.invalidateQueries({ queryKey: ["url-group-runs", groupId] });
    };

    return () => eventSource.close();
  }, [enabled, groupId, queryClient, runId]);

  return progress;
}
