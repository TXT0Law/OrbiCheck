import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  addGroupMember,
  createGroup,
  deleteGroup,
  getGroup,
  listGroups,
  removeGroupMember,
  updateGroup,
} from "@/lib/api/url-groups";
import type {
  UrlGroupCreateInput,
  UrlGroupMemberAddInput,
  UrlGroupUpdateInput,
} from "@/types/url-group";

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
