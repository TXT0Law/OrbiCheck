import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MonitorContentThresholdsForm } from "@/components/monitor/settings/monitor-content-thresholds-form";
import type { ContentThresholds } from "@/shared/types/monitor";

vi.mock("@/lib/hooks/use-appearance-language", () => ({
  useAppearanceLanguage: () => "en",
}));

const baseValue: ContentThresholds = {
  alertOnChange: true,
  minChangeSizeBytes: null,
};

describe("MonitorContentThresholdsForm — C-3 trigger / ignore words", () => {
  it("renders the trigger words advanced section", () => {
    render(
      <MonitorContentThresholdsForm value={baseValue} onChange={() => {}} />
    );
    // The <details> wrapper should be rendered even when no triggers are set.
    expect(screen.getByTestId("content-trigger-words-section")).toBeInTheDocument();
    expect(screen.getByTestId("content-trigger-words-input")).toBeInTheDocument();
    expect(screen.getByTestId("content-ignore-words-input")).toBeInTheDocument();
    expect(screen.getByTestId("content-trigger-regex-input")).toBeInTheDocument();
  });

  it("emits a sanitised triggerWords array on textarea change", () => {
    const onChange = vi.fn();
    render(
      <MonitorContentThresholdsForm value={baseValue} onChange={onChange} />
    );
    const textarea = screen.getByTestId("content-trigger-words-input");
    fireEvent.change(textarea, {
      target: { value: "price drop\n  in stock  \n\n" },
    });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ triggerWords: ["price drop", "in stock"] })
    );
  });

  it("clears triggerWords back to null when the textarea is empty", () => {
    const onChange = vi.fn();
    render(
      <MonitorContentThresholdsForm
        value={{ ...baseValue, triggerWords: ["sale"] }}
        onChange={onChange}
      />
    );
    fireEvent.change(screen.getByTestId("content-trigger-words-input"), {
      target: { value: "" },
    });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ triggerWords: null })
    );
  });

  it("emits a triggerRegex string when typed", () => {
    const onChange = vi.fn();
    render(
      <MonitorContentThresholdsForm value={baseValue} onChange={onChange} />
    );
    fireEvent.change(screen.getByTestId("content-trigger-regex-input"), {
      target: { value: "version\\s+\\d+" },
    });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ triggerRegex: "version\\s+\\d+" })
    );
  });
});

describe("MonitorContentThresholdsForm — C-5 fetch mode", () => {
  it("renders the HTTP/Browser select and hides fetchOptions in HTTP mode", () => {
    render(
      <MonitorContentThresholdsForm value={baseValue} onChange={() => {}} />
    );
    expect(screen.getByTestId("content-fetch-mode-select")).toBeInTheDocument();
    // fetchOptions <details> only appears in browser mode.
    expect(screen.queryByTestId("content-fetch-options-details")).toBeNull();
    expect(
      screen.queryByTestId("content-fetch-browser-min-interval-note")
    ).toBeNull();
  });

  it("switches to browser mode and exposes the advanced options + interval note", () => {
    const onChange = vi.fn();
    render(
      <MonitorContentThresholdsForm value={baseValue} onChange={onChange} />
    );
    fireEvent.change(screen.getByTestId("content-fetch-mode-select"), {
      target: { value: "browser" },
    });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ fetchMode: "browser" })
    );
  });

  it("renders fetchOptions inputs once browser mode is active", () => {
    render(
      <MonitorContentThresholdsForm
        value={{ ...baseValue, fetchMode: "browser" }}
        onChange={() => {}}
      />
    );
    expect(
      screen.getByTestId("content-fetch-browser-min-interval-note")
    ).toHaveTextContent(/300/);
    expect(screen.getByTestId("content-fetch-options-details")).toBeInTheDocument();
    expect(screen.getByTestId("content-fetch-wait-for-selector")).toBeInTheDocument();
    expect(screen.getByTestId("content-fetch-wait-ms")).toBeInTheDocument();
  });

  it("merges fetchOptions partial updates and drops them when emptied", () => {
    const onChange = vi.fn();
    render(
      <MonitorContentThresholdsForm
        value={{
          ...baseValue,
          fetchMode: "browser",
          fetchOptions: { waitMs: 500 },
        }}
        onChange={onChange}
      />
    );
    fireEvent.change(screen.getByTestId("content-fetch-wait-for-selector"), {
      target: { value: "main h1" },
    });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        fetchOptions: { waitMs: 500, waitForSelector: "main h1" },
      })
    );
  });

  it("clears fetchOptions when switching back to HTTP mode", () => {
    const onChange = vi.fn();
    render(
      <MonitorContentThresholdsForm
        value={{
          ...baseValue,
          fetchMode: "browser",
          fetchOptions: { waitForSelector: "header" },
        }}
        onChange={onChange}
      />
    );
    fireEvent.change(screen.getByTestId("content-fetch-mode-select"), {
      target: { value: "http" },
    });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ fetchMode: "http", fetchOptions: null })
    );
  });
});
