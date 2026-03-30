import { describe, expect, it } from "vitest";

import { normalizeMonitor } from "@/lib/api/monitors";

describe("normalizeMonitor", () => {
  it("maps is_enabled to isEnabled and keeps paused status consistent", () => {
    const m = normalizeMonitor({
      id: "a",
      display_name: "Test",
      url: "https://example.com",
      enabled_capabilities: ["uptime_only"],
      interval_seconds: 60,
      http_method: "GET",
      expected_status_code: null,
      is_enabled: false,
      status: "paused",
      last_check_at: null,
      last_status_code: null,
      last_response_time_ms: null,
      last_change_detected_at: null,
      ssl_expiry_days: null,
      total_checks: 0,
      uptime_percentage: null,
      avg_response_time_ms: null,
      tags: [],
      created_at: "2025-01-01T00:00:00.000Z",
      updated_at: "2025-01-01T00:00:00.000Z",
    } as Record<string, unknown>);

    expect(m.isEnabled).toBe(false);
    expect(m.status).toBe("paused");
    expect(m.displayName).toBe("Test");
  });

  it("infers isEnabled false from status paused when is_enabled is missing", () => {
    const m = normalizeMonitor({
      id: "b",
      displayName: "X",
      url: "https://x.com",
      enabledCapabilities: ["uptime_only"],
      intervalSeconds: 60,
      httpMethod: "GET",
      expectedStatusCode: null,
      status: "paused",
      lastCheckAt: null,
      lastStatusCode: null,
      lastResponseTimeMs: null,
      lastChangeDetectedAt: null,
      sslExpiryDays: null,
      totalChecks: 0,
      uptimePercentage: null,
      avgResponseTimeMs: null,
      tags: [],
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
    } as Record<string, unknown>);

    expect(m.isEnabled).toBe(false);
    expect(m.status).toBe("paused");
  });
});
