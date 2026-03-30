import type {
  UrlGroup,
  UrlGroupCreateInput,
  UrlGroupDetail,
  UrlGroupMember,
  UrlGroupMemberAddInput,
  UrlGroupUpdateInput,
} from "@/types/url-group";

import { apiClient } from "./client";

export async function listGroups(
  skip?: number,
  limit?: number
): Promise<{ groups: UrlGroup[]; total: number }> {
  const params: Record<string, number> = {};
  if (skip !== undefined) params.skip = skip;
  if (limit !== undefined) params.limit = limit;
  const { data } = await apiClient.get<{ groups: UrlGroup[]; total: number }>(
    "/url-groups",
    { params }
  );
  return data;
}

export async function getGroup(groupId: string): Promise<UrlGroupDetail> {
  const { data } = await apiClient.get<UrlGroupDetail>(
    `/url-groups/${groupId}`
  );
  return data;
}

export async function createGroup(
  input: UrlGroupCreateInput
): Promise<UrlGroup> {
  const { data } = await apiClient.post<UrlGroup>("/url-groups", input);
  return data;
}

export async function updateGroup(
  groupId: string,
  input: UrlGroupUpdateInput
): Promise<UrlGroup> {
  const { data } = await apiClient.put<UrlGroup>(
    `/url-groups/${groupId}`,
    input
  );
  return data;
}

export async function deleteGroup(groupId: string): Promise<void> {
  await apiClient.delete(`/url-groups/${groupId}`);
}

export async function getGroupMembers(
  groupId: string
): Promise<UrlGroupMember[]> {
  const { data } = await apiClient.get<{ members: UrlGroupMember[] }>(
    `/url-groups/${groupId}/members`
  );
  return data.members;
}

export async function addGroupMember(
  groupId: string,
  input: UrlGroupMemberAddInput
): Promise<UrlGroupMember> {
  const { data } = await apiClient.post<UrlGroupMember>(
    `/url-groups/${groupId}/members`,
    input
  );
  return data;
}

export async function removeGroupMember(
  groupId: string,
  memberId: string
): Promise<void> {
  await apiClient.delete(
    `/url-groups/${groupId}/members/${memberId}`
  );
}
