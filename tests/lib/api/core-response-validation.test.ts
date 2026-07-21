import { afterEach, describe, expect, it, vi } from "vitest";

const apiClientMock = {
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
};

vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();
  return {
    ...actual,
    apiClient: apiClientMock,
  };
});

describe("core API response validation", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("rejects malformed scan responses", async () => {
    apiClientMock.get.mockResolvedValue({ data: { id: 123 } });
    const { getScan } = await import("@/lib/api/scans");

    await expect(getScan("scan-1")).rejects.toMatchObject({
      code: "INVALID_RESPONSE_SHAPE",
      status: 502,
    });
  });

  it("rejects malformed alert responses", async () => {
    apiClientMock.get.mockResolvedValue({ data: [{ id: "alert-1" }] });
    const { getAlerts } = await import("@/lib/api/alerts");

    await expect(getAlerts()).rejects.toMatchObject({
      code: "INVALID_RESPONSE_SHAPE",
      status: 502,
    });
  });

  it("rejects malformed report responses", async () => {
    apiClientMock.get.mockResolvedValue({
      data: { id: "report-1", status: "completed" },
    });
    const { getReport } = await import("@/lib/api/reports");

    await expect(getReport("report-1")).rejects.toMatchObject({
      code: "INVALID_RESPONSE_SHAPE",
      status: 502,
    });
  });
});
