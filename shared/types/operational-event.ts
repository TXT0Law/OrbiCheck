export interface OperationalEvent {
  id: string;
  userId: number | null;
  eventType: string;
  status: string;
  targetUrl: string | null;
  scanId: string | null;
  monitorId: string | null;
  reportId: string | null;
  groupId: string | null;
  groupRunId: string | null;
  groupRunMemberId: string | null;
  durationMs: number | null;
  retryCount: number;
  errorCode: string | null;
  message: string | null;
  traceId: string | null;
  details: Record<string, unknown> | unknown[] | null;
  createdAt: string;
}

export interface OperationalEventListResult {
  events: OperationalEvent[];
}
