import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ScanLayout from "@/app/dashboard/scan/layout";
import ScanPage from "@/app/dashboard/scan/page";
import { APPEARANCE_KEYS } from "@/lib/mock-data";
import { useScanStore } from "@/lib/stores/scan-store";

const pushMock = vi.hoisted(() => vi.fn());
const replaceMock = vi.hoisted(() => vi.fn());
const pathnameMock = vi.hoisted(() => vi.fn(() => "/dashboard/scan"));
const searchParamsMock = vi.hoisted(() => vi.fn(() => new URLSearchParams()));
const invalidateQueriesMock = vi.hoisted(() => vi.fn());
const createScanMock = vi.hoisted(() => vi.fn());
const cancelScanMock = vi.hoisted(() => vi.fn());
const useScanListMock = vi.hoisted(() => vi.fn());
const useDeleteScanMock = vi.hoisted(() => vi.fn());
const useDeleteAllScansMock = vi.hoisted(() => vi.fn());
const useRescanMock = vi.hoisted(() => vi.fn());

type MockEventSourceInstance = {
  url: string;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  close: ReturnType<typeof vi.fn>;
};

const eventSources: MockEventSourceInstance[] = [];

class MockEventSource {
  url: string;

  onmessage: ((event: MessageEvent) => void) | null = null;

  onerror: ((event: Event) => void) | null = null;

  close = vi.fn();

  constructor(url: string) {
    this.url = url;
    eventSources.push(this as unknown as MockEventSourceInstance);
  }
}

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: pushMock, replace: replaceMock })),
  usePathname: pathnameMock,
  useSearchParams: searchParamsMock,
}));

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query");
  return {
    ...actual,
    useQueryClient: vi.fn(() => ({ invalidateQueries: invalidateQueriesMock })),
  };
});

vi.mock("@/lib/api/scans", () => ({
  createScan: createScanMock,
  cancelScan: cancelScanMock,
}));

vi.mock("@/lib/hooks/use-scan-list", () => ({
  useScanList: (...args: unknown[]) => useScanListMock(...args),
  useDeleteScan: (...args: unknown[]) => useDeleteScanMock(...args),
  useDeleteAllScans: (...args: unknown[]) => useDeleteAllScansMock(...args),
  useRescan: (...args: unknown[]) => useRescanMock(...args),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <ScanLayout>
        <ScanPage />
      </ScanLayout>
    </QueryClientProvider>
  );
}

describe("scan page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    pathnameMock.mockReturnValue("/dashboard/scan");
    searchParamsMock.mockReturnValue(new URLSearchParams());
    eventSources.length = 0;
    vi.stubGlobal("EventSource", MockEventSource);
    useScanStore.getState().clearActiveScan();

    useScanListMock.mockReturnValue({
      data: {
        total: 1,
        scans: [
          {
            id: "scan-older",
            domain: "older.test",
            url: "https://older.test",
            status: "completed",
            progress: 100,
            securityScore: 0,
            createdAt: "yesterday",
          },
        ],
      },
      isFetching: false,
    });

    useDeleteScanMock.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    });

    useRescanMock.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    });

    useDeleteAllScansMock.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    });
  });

  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("starts a scan from input and updates active scan", async () => {
    createScanMock.mockResolvedValue({
      id: "scan-1",
      url: "https://example.com",
      domain: "example.com",
    });
    renderPage();

    fireEvent.change(screen.getByLabelText("Scan target URL"), {
      target: { value: "example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /start scan/i }));

    await waitFor(() => {
      expect(createScanMock).toHaveBeenCalledWith(
        "https://example.com",
        expect.objectContaining({
          modules: expect.any(Array),
          enablePortScan: false,
          portScanProfile: "quick",
          acknowledgeScanAuthorization: false,
        })
      );
    });
    await waitFor(() => {
      expect(useScanStore.getState().activeScan).toEqual({
        scanId: "scan-1",
        url: "https://example.com",
        domain: "example.com",
      });
    });
    expect(invalidateQueriesMock).toHaveBeenCalled();
  });

  it("shows error when scan creation fails", async () => {
    createScanMock.mockRejectedValue(new Error("backend down"));
    renderPage();

    fireEvent.change(screen.getByLabelText("Scan target URL"), {
      target: { value: "https://error.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: /start scan/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/Failed to start scan for.*backend down/)
      ).toBeInTheDocument();
    });
  });

  it("requires authorization acknowledgment before starting a port scan", async () => {
    renderPage();

    fireEvent.change(screen.getByLabelText("Scan target URL"), {
      target: { value: "example.com" },
    });
    fireEvent.click(screen.getByRole("switch", { name: "Port Scanning" }));
    fireEvent.click(screen.getByRole("button", { name: /start scan/i }));

    await waitFor(() => {
      expect(
        screen.getByText("Please confirm that you are authorized to scan this target")
      ).toBeInTheDocument();
    });
    expect(createScanMock).not.toHaveBeenCalled();
  });

  it("shows progress stream error", async () => {
    useScanStore.setState({
      activeScan: {
        scanId: "scan-active",
        url: "https://active.test",
        domain: "active.test",
      },
    });

    renderPage();

    await waitFor(() => {
      expect(eventSources.length).toBeGreaterThan(0);
      const src = eventSources[eventSources.length - 1];
      expect(src.onerror).not.toBeNull();
    });

    const latestSource = eventSources[eventSources.length - 1];
    act(() => {
      latestSource.onerror?.(new Event("error"));
    });

    await waitFor(() => {
      expect(useScanStore.getState().activeScanProgressError).toBe(
        "Scan progress stream disconnected."
      );
      expect(screen.getByText("Scan progress stream disconnected.")).toBeInTheDocument();
    });
  });

  it("renders new scan list controls", () => {
    renderPage();

    expect(screen.getByLabelText("Search scans")).toBeInTheDocument();
    expect(screen.getByLabelText("Sort scans")).toBeInTheDocument();
    expect(screen.getByLabelText("Category filter")).toBeInTheDocument();
    expect(screen.getByLabelText("Scan rows per page")).toBeInTheDocument();
    expect(screen.getByText("Page 1 of 1 · 1 total scans")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete All" })).toBeInTheDocument();
  });

  it("renders the scan page chrome in Chinese", () => {
    localStorage.setItem(APPEARANCE_KEYS.language, "zh");

    renderPage();

    expect(screen.getByRole("heading", { name: "掃描" })).toBeInTheDocument();
    expect(screen.getByText("掃描清單")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "開始掃描" })).toBeInTheDocument();
    expect(screen.getByText("第 1 / 1 頁 · 共 1 筆掃描")).toBeInTheDocument();
  });

  it("updates URL query params when scan pagination changes", () => {
    useScanListMock.mockReturnValue({
      data: {
        total: 75,
        scans: [
          {
            id: "scan-older",
            domain: "older.test",
            url: "https://older.test",
            status: "completed",
            progress: 100,
            securityScore: 0,
            createdAt: "yesterday",
          },
        ],
      },
      isFetching: false,
    });

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(replaceMock).toHaveBeenCalledWith("/dashboard/scan?page=2", {
      scroll: false,
    });

    fireEvent.change(screen.getByLabelText("Scan rows per page"), {
      target: { value: "50" },
    });
    expect(replaceMock).toHaveBeenCalledWith("/dashboard/scan?pageSize=50", {
      scroll: false,
    });
  });

  it("resets scan pagination when filters change", () => {
    searchParamsMock.mockReturnValue(new URLSearchParams("page=3"));

    renderPage();

    fireEvent.change(screen.getByLabelText("Search scans"), {
      target: { value: "example.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    expect(replaceMock).toHaveBeenCalledWith(
      "/dashboard/scan?search=example.test",
      { scroll: false },
    );
  });

  it("renders running state and cancels active scan", async () => {
    useScanStore.setState({
      activeScan: {
        scanId: "scan-active",
        url: "https://active.test",
        domain: "active.test",
      },
    });

    cancelScanMock.mockResolvedValue(undefined);

    renderPage();

    expect(screen.getAllByText("active.test").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /^stop scan$/i }));

    await waitFor(() => {
      expect(cancelScanMock).toHaveBeenCalledWith("scan-active");
    });
    await waitFor(() => {
      expect(useScanStore.getState().activeScan).toBeNull();
    });
  });
});
