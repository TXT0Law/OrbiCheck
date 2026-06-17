import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

import { GroupRunProgress } from "@/components/scan/groups/group-run-progress";
import type { UrlGroupRun } from "@/types/url-group";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/hooks/use-operational-events", () => ({
  useUrlGroupRunOperationalEvents: () => ({
    data: {
      events: [
        {
          id: "event-1",
          userId: 1,
          eventType: "url_group_run.member_failed",
          status: "failed",
          targetUrl: "https://bad.example.com",
          scanId: null,
          monitorId: null,
          reportId: null,
          groupId: "group-1",
          groupRunId: "run-1",
          groupRunMemberId: "member-run-2",
          durationMs: 1200,
          retryCount: 1,
          errorCode: "GROUP_MEMBER_SCAN_FAILED",
          message: "Scan failed",
          traceId: "trace-123456",
          details: null,
          createdAt: "2026-05-28T00:01:00Z",
        },
      ],
    },
    isLoading: false,
    error: null,
  }),
}));

function buildRun(overrides: Partial<UrlGroupRun> = {}): UrlGroupRun {
  return {
    id: "run-1",
    groupId: "group-1",
    userId: 1,
    status: "partial",
    progress: 100,
    totalMembers: 2,
    queuedMembers: 0,
    runningMembers: 0,
    completedMembers: 1,
    failedMembers: 1,
    cancelledMembers: 0,
    skippedMembers: 0,
    concurrencyLimit: 3,
    errorMessage: null,
    createdAt: "2026-05-28T00:00:00Z",
    startedAt: "2026-05-28T00:00:00Z",
    completedAt: "2026-05-28T00:01:00Z",
    members: [
      {
        id: "member-run-1",
        groupMemberId: "member-1",
        url: "https://example.com",
        scanId: "scan-1",
        status: "completed",
        errorMessage: null,
        createdAt: "2026-05-28T00:00:00Z",
        startedAt: "2026-05-28T00:00:00Z",
        completedAt: "2026-05-28T00:01:00Z",
      },
      {
        id: "member-run-2",
        groupMemberId: "member-2",
        url: "https://bad.example.com",
        scanId: null,
        status: "failed",
        errorMessage: "Scan failed",
        createdAt: "2026-05-28T00:00:00Z",
        startedAt: "2026-05-28T00:00:00Z",
        completedAt: "2026-05-28T00:01:00Z",
      },
    ],
    ...overrides,
  };
}

describe("GroupRunProgress", () => {
  it("renders partial failure state and retry action", () => {
    const onCancel = vi.fn();
    const onRetryFailed = vi.fn();

    render(
      <GroupRunProgress
        run={buildRun()}
        onCancel={onCancel}
        onRetryFailed={onRetryFailed}
      />
    );

    expect(screen.getByText("Partial")).toBeInTheDocument();
    expect(screen.getByText(/1 completed, 1 failed/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "https://example.com" })).toHaveAttribute(
      "href",
      "/dashboard/scan/scan-1"
    );
    expect(screen.getAllByText("Scan failed").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Group Run Diagnostics")).toBeInTheDocument();
    expect(screen.getByText(/GROUP_MEMBER_SCAN_FAILED/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry failed" }));
    expect(onRetryFailed).toHaveBeenCalledWith("run-1");
  });

  it("shows cancel control only for active runs", () => {
    const onCancel = vi.fn();

    render(
      <GroupRunProgress
        run={buildRun({ status: "running", progress: 40, runningMembers: 1 })}
        onCancel={onCancel}
        onRetryFailed={() => {}}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledWith("run-1");
  });
});
