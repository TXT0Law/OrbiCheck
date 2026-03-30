import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import DashboardHomePage from "@/app/dashboard/page";
import SettingsPage from "@/app/dashboard/settings/page";
import LoginPage from "@/app/login/page";
import HomePage from "@/app/page";

const pushMock = vi.hoisted(() => vi.fn());
const redirectMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({
    push: pushMock,
  })),
  redirect: redirectMock,
}));

vi.mock("@/lib/hooks/use-scan-list", () => ({
  useScanList: vi.fn(() => ({
    data: {
      total: 2,
      scans: [
        {
          id: "scan-1",
          url: "https://example.com",
          domain: "example.com",
          status: "completed",
          progress: 100,
          totalModules: 30,
          completedModules: 30,
          securityScore: 10,
          errorMessage: null,
          startedAt: null,
          completedAt: null,
          createdAt: "now",
        },
      ],
    },
  })),
}));

vi.mock("@/lib/hooks/use-monitors", () => ({
  useMonitors: vi.fn(() => ({
    data: {
      data: [
        {
          id: "mon-1",
          displayName: "Example Monitor",
          url: "https://example.com",
          enabledCapabilities: ["uptime_only", "ssl_expiry"],
          capabilities: {
            uptime_only: {
              enabled: true,
              alert: { enabled: true, cooldownSeconds: 300, quietHours: null },
              thresholds: {
                maxResponseTimeMs: 5000,
                consecutiveFailures: 3,
                alertOnUnexpectedStatus: true,
              },
              intervalOverrideSeconds: null,
            },
            content_change: {
              enabled: false,
              alert: { enabled: true, cooldownSeconds: 300, quietHours: null },
              thresholds: { alertOnChange: true, minChangeSizeBytes: null },
              intervalOverrideSeconds: null,
            },
            ssl_expiry: {
              enabled: true,
              alert: { enabled: true, cooldownSeconds: 3600, quietHours: null },
              thresholds: { warnDaysRemaining: 30, criticalDaysRemaining: 7 },
              intervalOverrideSeconds: null,
            },
            visual_change: {
              enabled: false,
              alert: { enabled: false, cooldownSeconds: 300, quietHours: null },
              thresholds: {
                similarityThresholdPercent: 92,
                viewportWidth: 1280,
                viewportHeight: 720,
                fullPage: false,
                contentCorrelationWindowSeconds: null,
              },
              intervalOverrideSeconds: null,
            },
          },
          intervalSeconds: 300,
          httpMethod: "GET",
          expectedStatusCode: null,
          isEnabled: true,
          status: "up",
          capabilityStatuses: [],
          lastCheckAt: new Date().toISOString(),
          lastStatusCode: 200,
          lastResponseTimeMs: 200,
          lastChangeDetectedAt: null,
          sslExpiryDays: 12,
          totalChecks: 1,
          uptimePercentage: 99.2,
          avgResponseTimeMs: 200,
          tags: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    },
    isLoading: false,
    isError: false,
  })),
}));

vi.mock("@/lib/hooks/use-alerts", () => ({
  useAlerts: vi.fn(() => ({
    data: {
      data: [],
      meta: { total: 0 },
    },
    isLoading: false,
    isError: false,
  })),
}));

vi.mock("@/lib/hooks/use-appearance-language", () => ({
  useAppearanceLanguage: () => "en",
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe("core pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects home and login routes to dashboard", () => {
    HomePage();
    expect(redirectMock).toHaveBeenCalledWith("/dashboard");

    LoginPage();
    expect(redirectMock).toHaveBeenCalledWith("/dashboard");
  });

  it("dashboard page renders key sections", () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <DashboardHomePage />
      </QueryClientProvider>
    );

    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByText("Total Scans")).toBeInTheDocument();
    expect(screen.getByText("Recent Scans")).toBeInTheDocument();
    expect(screen.getAllByText("example.com").length).toBeGreaterThan(0);
  });

  it("settings page switches tabs and renders placeholders", () => {
    render(<SettingsPage />);

    expect(screen.getByText("Theme")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /api keys/i }));
    expect(screen.getByText("Configure API keys for AI-powered analysis. Keys are stored locally in your browser.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /profile/i }));
    expect(screen.getByText("Manage your display name, email, and avatar.")).toBeInTheDocument();
  });
});
