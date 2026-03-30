import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ScreenshotDetail } from "@/components/scan/details/screenshot-detail";

describe("ScreenshotDetail", () => {
  it("renders screenshot image and page source", () => {
    render(
      <ScreenshotDetail
        screenshot={{
          imageUrl: "data:image/png;base64,abc",
          viewport: "1280x720",
          capturedAt: "2026-01-01T00:00:00.000Z",
          unavailableReason: null,
        }}
        pageSource={{
          html: "<html><body>Hello</body></html>",
          statusCode: 200,
          contentType: "text/html",
          contentLength: 31,
          truncated: false,
          unavailableReason: null,
        }}
      />,
    );

    expect(screen.getByAltText("Scan capture")).toBeInTheDocument();
    expect(screen.getByText(/Viewport: 1280x720/i)).toBeInTheDocument();
    expect(screen.getByText("Page Source (HTML)")).toBeInTheDocument();
    expect(screen.getByText(/31.0 B/i)).toBeInTheDocument();
  });

  it("renders unavailable states when screenshot and source are missing", () => {
    render(
      <ScreenshotDetail
        screenshot={{
          imageUrl: "",
          viewport: "",
          capturedAt: "",
          unavailableReason: "Chromium unavailable",
        }}
        pageSource={{
          html: "",
          statusCode: null as never,
          contentType: "",
          contentLength: 0,
          truncated: false,
          unavailableReason: "No HTML",
        }}
      />,
    );

    expect(screen.getByText("Screenshot is unavailable for this scan.")).toBeInTheDocument();
    expect(screen.getByText("Chromium unavailable")).toBeInTheDocument();
    expect(screen.getByText("Page source is unavailable for this scan.")).toBeInTheDocument();
  });

  it("renders loading skeleton", () => {
    const { container } = render(<ScreenshotDetail isLoading screenshot={null} pageSource={null} />);
    expect(container.firstChild).toBeTruthy();
  });
});
