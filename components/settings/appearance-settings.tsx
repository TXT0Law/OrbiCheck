"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Card } from "@/components/ui/card";
import { APPEARANCE_LANGUAGE_CHANGED_EVENT } from "@/lib/hooks/use-appearance-language";
import { APPEARANCE_KEYS } from "@/lib/mock-data";

type ThemeOption = "light" | "dark" | "system";
type FontSizeOption = "small" | "default" | "large";
type LanguageOption = "en" | "zh";

const FONT_SIZE_CLASSES = ["text-sm", "text-base", "text-lg"];

function applyFontSizeClass(fontSize: FontSizeOption) {
  const root = document.documentElement;
  root.classList.remove(...FONT_SIZE_CLASSES);

  if (fontSize === "small") {
    root.classList.add("text-sm");
    return;
  }

  if (fontSize === "large") {
    root.classList.add("text-lg");
  }
}

export function AppearanceSettings() {
  const { theme, setTheme } = useTheme();
  const [fontSize, setFontSize] = useState<FontSizeOption>("default");
  const [language, setLanguage] = useState<LanguageOption>("en");

  useEffect(() => {
    const savedFontSize = localStorage.getItem(APPEARANCE_KEYS.fontSize) as FontSizeOption | null;
    const savedLanguage = localStorage.getItem(APPEARANCE_KEYS.language) as LanguageOption | null;

    if (savedFontSize === "small" || savedFontSize === "default" || savedFontSize === "large") {
      setFontSize(savedFontSize);
      applyFontSizeClass(savedFontSize);
    } else {
      applyFontSizeClass("default");
    }

    if (savedLanguage === "en" || savedLanguage === "zh") {
      setLanguage(savedLanguage);
    }
  }, []);

  const activeTheme: ThemeOption =
    theme === "light" || theme === "dark" || theme === "system" ? theme : "light";

  const handleFontSizeChange = (nextFontSize: FontSizeOption) => {
    setFontSize(nextFontSize);
    localStorage.setItem(APPEARANCE_KEYS.fontSize, nextFontSize);
    applyFontSizeClass(nextFontSize);
  };

  const handleLanguageChange = (nextLanguage: LanguageOption) => {
    setLanguage(nextLanguage);
    localStorage.setItem(APPEARANCE_KEYS.language, nextLanguage);
    window.dispatchEvent(new Event(APPEARANCE_LANGUAGE_CHANGED_EVENT));
  };

  return (
    <Card className="p-6">
      <div className="space-y-8">
        <div className="space-y-3">
          <div>
            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Theme</h3>
            <p className="text-sm text-muted-foreground">Select your preferred color scheme.</p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {[
              { value: "light" as const, label: "Light", icon: Sun },
              { value: "dark" as const, label: "Dark", icon: Moon },
              { value: "system" as const, label: "System", icon: Monitor },
            ].map((option) => {
              const Icon = option.icon;
              const isActive = activeTheme === option.value;

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setTheme(option.value)}
                  className={`rounded-lg border p-4 transition-all ${
                    isActive
                      ? "border-zinc-900 bg-zinc-50 ring-1 ring-zinc-900 dark:border-zinc-100 dark:bg-zinc-800 dark:ring-zinc-100"
                      : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-700 dark:hover:border-zinc-600"
                  }`}
                >
                  <div className="flex flex-col items-center gap-2">
                    <Icon className="h-6 w-6 text-zinc-700 dark:text-zinc-200" />
                    <span className="text-sm text-zinc-900 dark:text-zinc-100">
                      {option.label}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Font Size
            </h3>
            <p className="text-sm text-muted-foreground">
              Adjust the base font size across the interface.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {[
              { value: "small" as const, label: "Small", previewClass: "text-xs" },
              { value: "default" as const, label: "Default", previewClass: "text-sm" },
              { value: "large" as const, label: "Large", previewClass: "text-base" },
            ].map((option) => {
              const isActive = fontSize === option.value;

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleFontSizeChange(option.value)}
                  className={`rounded-lg border p-4 text-left transition-all ${
                    isActive
                      ? "border-zinc-900 bg-zinc-50 ring-1 ring-zinc-900 dark:border-zinc-100 dark:bg-zinc-800 dark:ring-zinc-100"
                      : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-700 dark:hover:border-zinc-600"
                  }`}
                >
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {option.label}
                    </p>
                    <p className={`${option.previewClass} text-muted-foreground`}>
                      The quick brown fox jumps.
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Language
            </h3>
            <p className="text-sm text-muted-foreground">Choose your preferred display language.</p>
          </div>

          <select
            value={language}
            onChange={(event) => handleLanguageChange(event.target.value as LanguageOption)}
            className="h-10 w-[200px] rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            <option value="en">English</option>
            <option value="zh">中文</option>
          </select>
        </div>
      </div>
    </Card>
  );
}
