import type {
  UrlGroup,
  UrlGroupCreateInput,
  UrlGroupDetail,
  UrlGroupMember,
  UrlGroupMemberAddInput,
  UrlGroupRun,
  UrlGroupRunCreateInput,
  UrlGroupUpdateInput,
} from "@/types/url-group";
import { z } from "zod";

import { apiClient } from "./client";

const nullableDateStringSchema = z.string().nullable();

const urlGroupSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  memberCount: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
}) satisfies z.ZodType<UrlGroup>;

const urlGroupMemberSchema = z.object({
  id: z.string(),
  url: z.string(),
  displayLabel: z.string().nullable(),
  sortOrder: z.number(),
  createdAt: z.string(),
  scanId: z.string().nullable(),
  status: z.string(),
  securityScore: z.number().nullable(),
}) satisfies z.ZodType<UrlGroupMember>;

const urlGroupRunMemberSchema = z.object({
  id: z.string(),
  groupMemberId: z.string(),
  url: z.string(),
  scanId: z.string().nullable(),
  status: z.enum([
    "queued",
    "creating_scan",
    "running",
    "completed",
    "failed",
    "cancelled",
    "skipped",
  ]),
  errorMessage: z.string().nullable(),
  createdAt: z.string(),
  startedAt: nullableDateStringSchema,
  completedAt: nullableDateStringSchema,
});

const urlGroupRunSchema = z.object({
  id: z.string(),
  groupId: z.string(),
  userId: z.number().nullable(),
  status: z.enum([
    "pending",
    "running",
    "completed",
    "failed",
    "cancelled",
    "partial",
  ]),
  progress: z.number(),
  totalMembers: z.number(),
  queuedMembers: z.number(),
  runningMembers: z.number(),
  completedMembers: z.number(),
  failedMembers: z.number(),
  cancelledMembers: z.number(),
  skippedMembers: z.number(),
  concurrencyLimit: z.number(),
  errorMessage: z.string().nullable(),
  createdAt: z.string(),
  startedAt: nullableDateStringSchema,
  completedAt: nullableDateStringSchema,
  members: z.array(urlGroupRunMemberSchema),
}) satisfies z.ZodType<UrlGroupRun>;

const urlGroupListSchema = z.object({
  groups: z.array(urlGroupSchema),
  total: z.number(),
});

const urlGroupDetailSchema = urlGroupSchema.extend({
  members: z.array(urlGroupMemberSchema),
}) satisfies z.ZodType<UrlGroupDetail>;

const urlGroupRunListSchema = z.object({
  runs: z.array(urlGroupRunSchema),
  total: z.number(),
});

function readRecordValue(
  record: Record<string, unknown>,
  camelKey: string,
  snakeKey: string
): unknown {
  return record[camelKey] ?? record[snakeKey];
}

function normalizeGroupRunMemberPayload(payload: unknown): unknown {
  if (typeof payload !== "object" || payload === null) {
    return payload;
  }
  const record = payload as Record<string, unknown>;
  return {
    id: record.id,
    groupMemberId: readRecordValue(record, "groupMemberId", "group_member_id"),
    url: record.url,
    scanId: readRecordValue(record, "scanId", "scan_id") ?? null,
    status: record.status,
    errorMessage: readRecordValue(record, "errorMessage", "error_message") ?? null,
    createdAt: readRecordValue(record, "createdAt", "created_at") ?? "",
    startedAt: readRecordValue(record, "startedAt", "started_at") ?? null,
    completedAt: readRecordValue(record, "completedAt", "completed_at") ?? null,
  };
}

function normalizeGroupRunPayload(payload: unknown): unknown {
  if (typeof payload !== "object" || payload === null) {
    return payload;
  }
  const record = payload as Record<string, unknown>;
  const members = Array.isArray(record.members) ? record.members : [];
  return {
    id: record.id ?? record.runId,
    groupId: readRecordValue(record, "groupId", "group_id"),
    userId: readRecordValue(record, "userId", "user_id") ?? null,
    status: record.status,
    progress: record.progress,
    totalMembers: readRecordValue(record, "totalMembers", "total_members"),
    queuedMembers: readRecordValue(record, "queuedMembers", "queued_members"),
    runningMembers: readRecordValue(record, "runningMembers", "running_members"),
    completedMembers: readRecordValue(record, "completedMembers", "completed_members"),
    failedMembers: readRecordValue(record, "failedMembers", "failed_members"),
    cancelledMembers: readRecordValue(record, "cancelledMembers", "cancelled_members"),
    skippedMembers: readRecordValue(record, "skippedMembers", "skipped_members"),
    concurrencyLimit: readRecordValue(record, "concurrencyLimit", "concurrency_limit") ?? 1,
    errorMessage: readRecordValue(record, "errorMessage", "error_message") ?? null,
    createdAt: readRecordValue(record, "createdAt", "created_at") ?? "",
    startedAt: readRecordValue(record, "startedAt", "started_at") ?? null,
    completedAt: readRecordValue(record, "completedAt", "completed_at") ?? null,
    members: members.map(normalizeGroupRunMemberPayload),
  };
}

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
  return urlGroupListSchema.parse(data);
}

export async function getGroup(groupId: string): Promise<UrlGroupDetail> {
  const { data } = await apiClient.get<UrlGroupDetail>(
    `/url-groups/${groupId}`
  );
  return urlGroupDetailSchema.parse(data);
}

export async function createGroup(
  input: UrlGroupCreateInput
): Promise<UrlGroup> {
  const { data } = await apiClient.post<UrlGroup>("/url-groups", input);
  return urlGroupSchema.parse(data);
}

export async function updateGroup(
  groupId: string,
  input: UrlGroupUpdateInput
): Promise<UrlGroup> {
  const { data } = await apiClient.put<UrlGroup>(
    `/url-groups/${groupId}`,
    input
  );
  return urlGroupSchema.parse(data);
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
  return z.object({ members: z.array(urlGroupMemberSchema) }).parse(data).members;
}

export async function addGroupMember(
  groupId: string,
  input: UrlGroupMemberAddInput
): Promise<UrlGroupMember> {
  const { data } = await apiClient.post<UrlGroupMember>(
    `/url-groups/${groupId}/members`,
    input
  );
  return urlGroupMemberSchema.parse(data);
}

export async function removeGroupMember(
  groupId: string,
  memberId: string
): Promise<void> {
  await apiClient.delete(
    `/url-groups/${groupId}/members/${memberId}`
  );
}

export async function createGroupRun(
  groupId: string,
  input: UrlGroupRunCreateInput = {}
): Promise<UrlGroupRun> {
  const { data } = await apiClient.post<UrlGroupRun>(
    `/url-groups/${groupId}/runs`,
    input
  );
  return urlGroupRunSchema.parse(data);
}

export async function listGroupRuns(
  groupId: string,
  skip?: number,
  limit?: number
): Promise<{ runs: UrlGroupRun[]; total: number }> {
  const params: Record<string, number> = {};
  if (skip !== undefined) params.skip = skip;
  if (limit !== undefined) params.limit = limit;
  const { data } = await apiClient.get<{ runs: UrlGroupRun[]; total: number }>(
    `/url-groups/${groupId}/runs`,
    { params }
  );
  return urlGroupRunListSchema.parse(data);
}

export async function getGroupRun(
  groupId: string,
  runId: string
): Promise<UrlGroupRun> {
  const { data } = await apiClient.get<UrlGroupRun>(
    `/url-groups/${groupId}/runs/${runId}`
  );
  return urlGroupRunSchema.parse(data);
}

export async function cancelGroupRun(
  groupId: string,
  runId: string
): Promise<UrlGroupRun> {
  const { data } = await apiClient.post<UrlGroupRun>(
    `/url-groups/${groupId}/runs/${runId}/cancel`
  );
  return urlGroupRunSchema.parse(data);
}

export async function retryFailedGroupRun(
  groupId: string,
  runId: string,
  input: UrlGroupRunCreateInput = {}
): Promise<UrlGroupRun> {
  const { data } = await apiClient.post<UrlGroupRun>(
    `/url-groups/${groupId}/runs/${runId}/retry-failed`,
    input
  );
  return urlGroupRunSchema.parse(data);
}

export function parseGroupRunProgress(payload: unknown): UrlGroupRun {
  return urlGroupRunSchema.parse(normalizeGroupRunPayload(payload));
}
