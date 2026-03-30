import { afterEach, describe, expect, it, vi } from "vitest";

const getBrowserApiAbsoluteUrl = vi.fn((path: string) => `http://api.local${path}`);

vi.mock("@/lib/api/client", () => ({
  getBrowserApiAbsoluteUrl,
}));

describe("downloadFromApiGet", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("downloads a file from the API", async () => {
    const click = vi.fn();
    const blob = new Blob(["hello"]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        blob: vi.fn().mockResolvedValue(blob),
      }),
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

    expect(getBrowserApiAbsoluteUrl).toHaveBeenCalledWith("/changes/export.csv");
    expect(click).toHaveBeenCalled();
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
