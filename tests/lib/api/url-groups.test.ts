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
    const expected = { groups: [{ id: "group-1", name: "Group 1", createdAt: "", updatedAt: "" }], total: 1 };
    apiClientMock.get.mockResolvedValue({ data: expected });
    const mod = await import("@/lib/api/url-groups");

    const result = await mod.listGroups(0, 10);

    expect(apiClientMock.get).toHaveBeenCalledWith("/url-groups", { params: { skip: 0, limit: 10 } });
    expect(result).toEqual(expected);
  });

  it("creates and deletes a group", async () => {
    apiClientMock.post.mockResolvedValue({ data: { id: "group-1", name: "New Group" } });
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
    apiClientMock.post.mockResolvedValue({ data: { id: "member-1", url: "https://example.com" } });
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
});
