import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { GroupCard } from "@/components/scan/groups/group-card";

vi.mock("@/lib/hooks/use-url-groups", () => {
  const mutation = () => ({ mutate: vi.fn(), isPending: false });
  return {
    useUrlGroup: () => ({ data: undefined }),
    useGroupRuns: () => ({ data: { runs: [{ id: "run-a", status: "completed" }] } }),
    useGroupRunProgress: () => ({ id: "run-a", status: "running" }),
    useDeleteGroup: mutation,
    useRemoveGroupMember: mutation,
    useCreateGroupRun: mutation,
    useCancelGroupRun: mutation,
    useRetryFailedGroupRun: mutation,
  };
});
vi.mock("@/lib/hooks/use-scan-list", () => ({ useRescan: () => ({ mutate: vi.fn(), isPending: false }) }));
vi.mock("@/components/scan/groups/add-member-dialog", () => ({ AddMemberDialog: () => null }));
vi.mock("@/components/scan/groups/group-member-row", () => ({ GroupMemberRow: () => null }));
vi.mock("@/components/scan/groups/group-run-progress", () => ({ GroupRunProgress: () => null }));
it("enables another group scan when REST completes despite an older live running snapshot", () => {
  const client = new QueryClient();
  render(<QueryClientProvider client={client}><GroupCard
    group={{ id: "group-a", name: "Work", description: null, memberCount: 1, createdAt: "", updatedAt: "" }}
    onEdit={vi.fn()}
  /></QueryClientProvider>);
  expect(screen.getByRole("button", { name: "Scan Group", exact: true })).toBeEnabled();
});
