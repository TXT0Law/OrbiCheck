/** URL Group types for organizing multiple URLs. */

export type UrlGroupMemberStatus =
  | "incomplete"
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

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
