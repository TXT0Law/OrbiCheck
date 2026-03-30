import { act, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiKeysSettings } from "@/components/settings/api-keys-settings";
import { AppearanceSettings } from "@/components/settings/appearance-settings";
import { PlaceholderSection } from "@/components/settings/placeholder-section";
import { SettingsNav } from "@/components/settings/settings-nav";
import { APPEARANCE_KEYS } from "@/lib/mock-data";

const setTheme = vi.fn();

vi.mock("next-themes", () => ({
  useTheme: vi.fn(() => ({
    theme: "light",
    resolvedTheme: "light",
    setTheme,
  })),
}));

describe("settings components", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("changes tabs via settings nav", () => {
    const onTabChange = vi.fn();

    render(<SettingsNav activeTab="appearance" onTabChange={onTabChange} />);

    fireEvent.click(screen.getByRole("button", { name: /api keys/i }));
    expect(onTabChange).toHaveBeenCalledWith("api-keys");
  });

  it("loads and updates appearance preferences", () => {
    localStorage.setItem(APPEARANCE_KEYS.fontSize, "large");
    localStorage.setItem(APPEARANCE_KEYS.language, "zh");

    render(<AppearanceSettings />);

    expect(document.documentElement.classList.contains("text-lg")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /dark/i }));
    expect(setTheme).toHaveBeenCalledWith("dark");

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "en" } });
    expect(localStorage.getItem(APPEARANCE_KEYS.language)).toBe("en");
  });

  it("saves, tests, edits, and deletes API keys", () => {
    vi.useFakeTimers();

    render(<ApiKeysSettings />);

    const saveButtons = screen.getAllByRole("button", { name: "Save" });
    const openAiInput = screen.getByPlaceholderText("sk-proj-...");

    fireEvent.change(openAiInput, { target: { value: "sk-proj-secret-12345" } });
    fireEvent.click(saveButtons[0]);

    expect(screen.getByText(/sk-pr\*\*\*\*\.\.\./i)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Test" })[0]);
    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(screen.getByText(/connection successful/i)).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]);
    expect(screen.getByPlaceholderText("sk-proj-...")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("sk-proj-..."), { target: { value: "sk-proj-secret-2" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Save" })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]);

    expect(localStorage.getItem("orbicheck_apikey_openai")).toBeNull();
  });

  it("renders placeholder section", () => {
    render(<PlaceholderSection title="Profile" description="Manage account profile" />);

    expect(screen.getByText("Profile")).toBeInTheDocument();
    expect(screen.getByText("Coming Soon")).toBeInTheDocument();
  });
});
