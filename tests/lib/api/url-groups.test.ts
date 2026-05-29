import { afterEach, describe, expect, it, vi } from "vitest";

const apiClientMock = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
};

vi.mock("@/lib/api/client", () => ({
  apiClient: apiClientMock,
}));

describe("url-groups api", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("lists groups", async () => {
    const expected = {
      groups: [
        {
          id: "group-1",
          name: "Group 1",
          description: null,
          memberCount: 0,
          createdAt: "",
          updatedAt: "",
        },
      ],
      total: 1,
    };
    apiClientMock.get.mockResolvedValue({ data: expected });
    const mod = await import("@/lib/api/url-groups");

    const result = await mod.listGroups(0, 10);

    expect(apiClientMock.get).toHaveBeenCalledWith("/url-groups", { params: { skip: 0, limit: 10 } });
    expect(result).toEqual(expected);
  });

  it("creates and deletes a group", async () => {
    apiClientMock.post.mockResolvedValue({
      data: {
        id: "group-1",
        name: "New Group",
        description: "",
        memberCount: 0,
        createdAt: "",
        updatedAt: "",
      },
    });
    apiClientMock.delete.mockResolvedValue({});
    const mod = await import("@/lib/api/url-groups");

    const created = await mod.createGroup({ name: "New Group", description: "" });
    await mod.deleteGroup("group-1");

    expect(created.id).toBe("group-1");
    expect(apiClientMock.post).toHaveBeenCalledWith("/url-groups", {
      name: "New Group",
      description: "",
    });
    expect(apiClientMock.delete).toHaveBeenCalledWith("/url-groups/group-1");
  });

  it("adds and removes a group member", async () => {
    apiClientMock.post.mockResolvedValue({
      data: {
        id: "member-1",
        url: "https://example.com",
        displayLabel: null,
        sortOrder: 1,
        createdAt: "",
        scanId: null,
        status: "incomplete",
        securityScore: null,
      },
    });
    apiClientMock.delete.mockResolvedValue({});
    const mod = await import("@/lib/api/url-groups");

    const member = await mod.addGroupMember("group-1", { url: "https://example.com" });
    await mod.removeGroupMember("group-1", "member-1");

    expect(member.id).toBe("member-1");
    expect(apiClientMock.post).toHaveBeenCalledWith("/url-groups/group-1/members", {
      url: "https://example.com",
    });
    expect(apiClientMock.delete).toHaveBeenCalledWith("/url-groups/group-1/members/member-1");
  });

  it("creates and controls group runs", async () => {
    const run = {
      id: "run-1",
      groupId: "group-1",
      userId: 1,
      status: "running",
      progress: 20,
      totalMembers: 2,
      queuedMembers: 1,
      runningMembers: 1,
      completedMembers: 0,
      failedMembers: 0,
      cancelledMembers: 0,
      skippedMembers: 0,
      concurrencyLimit: 3,
      errorMessage: null,
      createdAt: "2026-05-28T00:00:00Z",
      startedAt: "2026-05-28T00:00:00Z",
      completedAt: null,
      members: [
        {
          id: "run-member-1",
          groupMemberId: "member-1",
          url: "https://example.com",
          scanId: "scan-1",
          status: "running",
          errorMessage: null,
          createdAt: "2026-05-28T00:00:00Z",
          startedAt: "2026-05-28T00:00:00Z",
          completedAt: null,
        },
      ],
    };
    apiClientMock.post.mockResolvedValue({ data: run });
    apiClientMock.get.mockResolvedValue({ data: { runs: [run], total: 1 } });
    const mod = await import("@/lib/api/url-groups");

    const created = await mod.createGroupRun("group-1", { concurrencyLimit: 3 });
    const listed = await mod.listGroupRuns("group-1", 0, 10);
    await mod.cancelGroupRun("group-1", "run-1");
    await mod.retryFailedGroupRun("group-1", "run-1", { concurrencyLimit: 2 });

    expect(created.id).toBe("run-1");
    expect(listed.total).toBe(1);
    expect(apiClientMock.post).toHaveBeenCalledWith("/url-groups/group-1/runs", {
      concurrencyLimit: 3,
    });
    expect(apiClientMock.get).toHaveBeenCalledWith("/url-groups/group-1/runs", {
      params: { skip: 0, limit: 10 },
    });
    expect(apiClientMock.post).toHaveBeenCalledWith(
      "/url-groups/group-1/runs/run-1/cancel"
    );
    expect(apiClientMock.post).toHaveBeenCalledWith(
      "/url-groups/group-1/runs/run-1/retry-failed",
      { concurrencyLimit: 2 }
    );
  });

  it("normalizes snake_case group run progress payloads", async () => {
    const mod = await import("@/lib/api/url-groups");

    const parsed = mod.parseGroupRunProgress({
      runId: "run-1",
      group_id: "group-1",
      status: "running",
      progress: 50,
      total_members: 2,
      queued_members: 1,
      running_members: 1,
      completed_members: 0,
      failed_members: 0,
      cancelled_members: 0,
      skipped_members: 0,
      members: [
        {
          id: "member-run-1",
          group_member_id: "member-1",
          url: "https://example.com",
          scan_id: "scan-1",
          status: "running",
        },
      ],
    });

    expect(parsed.groupId).toBe("group-1");
    expect(parsed.totalMembers).toBe(2);
    expect(parsed.members[0].scanId).toBe("scan-1");
  });
});
