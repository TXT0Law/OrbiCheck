import { afterEach, describe, expect, it, vi } from "vitest";

describe("downloadFromApiGet", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("downloads a file from the API", async () => {
    const click = vi.fn();
    const blob = new Blob(["hello"]);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: vi.fn().mockResolvedValue(blob),
    });
    vi.stubGlobal(
      "fetch",
      fetchMock,
    );
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn().mockReturnValue("blob:download"),
      revokeObjectURL: vi.fn(),
    });
    vi.spyOn(document, "createElement").mockReturnValue({
      click,
      set href(_value: string) {},
      set download(_value: string) {},
      set rel(_value: string) {},
    } as unknown as HTMLAnchorElement);
    const mod = await import("@/lib/utils/export-download");

    await mod.downloadFromApiGet("/changes/export.csv", "changes.csv");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/changes/export.csv"),
      { credentials: "include", method: "GET" }
    );
    expect(click).toHaveBeenCalled();
  });

  it("uses absolute API URLs without prepending the frontend origin", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.com");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: vi.fn().mockResolvedValue(new Blob(["hello"])),
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn().mockReturnValue("blob:download"),
      revokeObjectURL: vi.fn(),
    });
    vi.spyOn(document, "createElement").mockReturnValue({
      click: vi.fn(),
      set href(_value: string) {},
      set download(_value: string) {},
      set rel(_value: string) {},
    } as unknown as HTMLAnchorElement);
    const mod = await import("@/lib/utils/export-download");

    await mod.downloadFromApiGet("/reports/export.pdf", "report.pdf");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/api/v1/reports/export.pdf",
      { credentials: "include", method: "GET" }
    );
  });

  it("throws when the download response is not ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      }),
    );
    const mod = await import("@/lib/utils/export-download");

    await expect(
      mod.downloadFromApiGet("/changes/export.csv", "changes.csv"),
    ).rejects.toThrow("Download failed: HTTP 500");
  });
});
