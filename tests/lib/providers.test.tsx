import { useMutation, useQuery } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Providers } from "@/lib/providers";
import { useToastStore } from "@/lib/stores/toast-store";

function FailingMutationButton({ withLocalToast }: { withLocalToast: boolean }) {
  const toast = useToastStore((s) => s.toast);
  const mutation = useMutation({
    mutationFn: async () => {
      throw new Error("Mutation exploded");
    },
  });

  async function handleClick() {
    try {
      await mutation.mutateAsync();
    } catch (error) {
      if (withLocalToast) {
        const message = error instanceof Error ? error.message : "Local mutation failed";
        toast({
          title: "Local failed",
          description: message,
          variant: "destructive",
          duration: null,
        });
      }
    }
  }

  return (
    <>
      <button type="button" onClick={() => void handleClick()}>
        Run mutation
      </button>
      <span>{mutation.status}</span>
    </>
  );
}

function DuplicateFailingQueries() {
  useQuery({
    queryKey: ["duplicate-failure", "one"],
    queryFn: async () => {
      throw new Error("Same query failure");
    },
    retry: false,
  });
  useQuery({
    queryKey: ["duplicate-failure", "two"],
    queryFn: async () => {
      throw new Error("Same query failure");
    },
    retry: false,
  });

  return <div>Duplicate query fixture</div>;
}

describe("Providers global mutation error handling", () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] });
  });

  afterEach(() => {
    useToastStore.setState({ toasts: [] });
  });

  it("shows a global mutation toast when no local handler emits one", async () => {
    render(
      <Providers>
        <FailingMutationButton withLocalToast={false} />
      </Providers>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Run mutation" }));
    await waitFor(() => expect(screen.getByText("error")).toBeInTheDocument());

    expect(await screen.findByText("Request failed")).toBeInTheDocument();
    expect(screen.getByText("Mutation exploded")).toBeInTheDocument();
  });

  it("does not duplicate local mutation error toasts", async () => {
    render(
      <Providers>
        <FailingMutationButton withLocalToast />
      </Providers>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Run mutation" }));
    await waitFor(() => expect(screen.getByText("Local failed")).toBeInTheDocument());

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(screen.getByText("Local failed")).toBeInTheDocument();
    expect(screen.queryByText("Request failed")).not.toBeInTheDocument();
  });

  it("deduplicates identical global query error toasts", async () => {
    render(
      <Providers>
        <DuplicateFailingQueries />
      </Providers>,
    );

    expect(await screen.findByText("Request failed")).toBeInTheDocument();
    expect(screen.getByText("Same query failure")).toBeInTheDocument();
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(screen.getAllByText("Request failed")).toHaveLength(1);
  });
});
