/** URL Group types for organizing multiple URLs. */

export type UrlGroupMemberStatus =
  | "incomplete"
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type UrlGroupRunStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "partial";

export type UrlGroupRunMemberStatus =
  | "queued"
  | "creating_scan"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "skipped";

export interface UrlGroup {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface UrlGroupMember {
  id: string;
  url: string;
  displayLabel: string | null;
  sortOrder: number;
  createdAt: string;
  scanId: string | null;
  status: string;
  securityScore: number | null;
}

export interface UrlGroupDetail extends UrlGroup {
  members: UrlGroupMember[];
}

export interface UrlGroupCreateInput {
  name: string;
  description?: string;
}

export interface UrlGroupUpdateInput {
  name?: string;
  description?: string;
}

export interface UrlGroupMemberAddInput {
  url: string;
  displayLabel?: string;
}

export interface UrlGroupRunCreateInput {
  modules?: string[];
  enablePortScan?: boolean;
  portScanProfile?: "quick" | "standard" | "deep";
  acknowledgeScanAuthorization?: boolean;
  concurrencyLimit?: number;
  skipRecentlyScannedWithinSeconds?: number;
}

export interface UrlGroupRunMember {
  id: string;
  groupMemberId: string;
  url: string;
  scanId: string | null;
  status: UrlGroupRunMemberStatus;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface UrlGroupRun {
  id: string;
  groupId: string;
  userId: number | null;
  status: UrlGroupRunStatus;
  progress: number;
  totalMembers: number;
  queuedMembers: number;
  runningMembers: number;
  completedMembers: number;
  failedMembers: number;
  cancelledMembers: number;
  skippedMembers: number;
  concurrencyLimit: number;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  members: UrlGroupRunMember[];
}
