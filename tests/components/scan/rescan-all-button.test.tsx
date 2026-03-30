import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RescanAllButton } from "@/components/scan/rescan-all-button";

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
};

describe("RescanAllButton", () => {
  it("renders button with rescannable count when terminal scans exist", () => {
    const scans = [
      {
        id: "1",
        url: "https://example.com",
        domain: "example.com",
        status: "completed" as const,
        progress: 100,
        totalModules: 10,
        completedModules: 10,
        securityScore: null,
        errorMessage: null,
        startedAt: null,
        completedAt: null,
        createdAt: "",
      },
    ];
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <RescanAllButton scans={scans} />
      </Wrapper>
    );
    expect(screen.getByText(/Rescan All \(1\)/)).toBeInTheDocument();
  });

  it("renders disabled when no scans", () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <RescanAllButton scans={[]} />
      </Wrapper>
    );
    const btn = screen.getByRole("button", { name: /Rescan All \(0\)/ });
    expect(btn).toBeDisabled();
  });

  it("renders disabled when no terminal scans", () => {
    const scans = [
      {
        id: "1",
        url: "https://example.com",
        domain: "example.com",
        status: "running" as const,
        progress: 50,
        totalModules: 10,
        completedModules: 5,
        securityScore: null,
        errorMessage: null,
        startedAt: null,
        completedAt: null,
        createdAt: "",
      },
    ];
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <RescanAllButton scans={scans} />
      </Wrapper>
    );
    const btn = screen.getByRole("button", { name: /Rescan All \(0\)/ });
    expect(btn).toBeDisabled();
  });
});
