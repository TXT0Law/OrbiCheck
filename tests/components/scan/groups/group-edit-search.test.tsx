import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EditGroupDialog } from "@/components/scan/groups/edit-group-dialog";
import { ScanGroupView } from "@/components/scan/scan-group-view";

const mocks = vi.hoisted(() => ({ mutate: vi.fn(), groups: vi.fn() }));
vi.mock("@/lib/hooks/use-url-groups", () => ({
  useUpdateGroup: () => ({ mutate: mocks.mutate, isPending: false }),
  useUrlGroups: mocks.groups,
}));
vi.mock("@/components/scan/groups/group-card", () => ({
  GroupCard: ({ group }: { group: { name: string } }) => <div>{group.name}</div>,
}));
vi.mock("@/components/scan/groups/create-group-dialog", () => ({ CreateGroupDialog: () => null }));
const group = { id: "group-a", name: "Work", description: "Old description", memberCount: 1, createdAt: "", updatedAt: "" };

beforeEach(() => vi.clearAllMocks());
describe("group editing and search", () => {
  it("sends an explicit empty description when clearing it", () => {
    render(<EditGroupDialog group={group} open onOpenChange={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Description (optional)"), { target: { value: "  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(mocks.mutate).toHaveBeenCalledWith({ name: "Work", description: "" }, expect.any(Object));
  });
  it("keeps backend member URL matches whose group names do not match", () => {
    mocks.groups.mockReturnValue({ data: { groups: [group], total: 1 }, isLoading: false });
    render(<ScanGroupView onEdit={vi.fn()} searchTerm="example.com" />);
    expect(mocks.groups).toHaveBeenCalledWith(0, 100, "example.com");
    expect(screen.getByText("Work")).toBeInTheDocument();
  });
});
