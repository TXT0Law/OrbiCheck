"use client";

import { useSyncExternalStore } from "react";

import { APPEARANCE_KEYS } from "@/lib/mock-data";

/** Dispatched on the same document after Settings saves language (storage event does not fire in the same tab). */
export const APPEARANCE_LANGUAGE_CHANGED_EVENT = "orbicheck-language-changed";

export type AppearanceLanguage = "en" | "zh";

function readLanguage(): AppearanceLanguage {
  if (typeof window === "undefined") {
    return "en";
  }
  const raw = localStorage.getItem(APPEARANCE_KEYS.language);
  return raw === "zh" ? "zh" : "en";
}

function subscribe(onStoreChange: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === APPEARANCE_KEYS.language) {
      onStoreChange();
    }
  };
  const onCustom = () => {
    onStoreChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(APPEARANCE_LANGUAGE_CHANGED_EVENT, onCustom);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(APPEARANCE_LANGUAGE_CHANGED_EVENT, onCustom);
  };
}

/**
 * Reads Settings → Language (`orbicheck_language`). Defaults to English.
 */
export function useAppearanceLanguage(): AppearanceLanguage {
  return useSyncExternalStore(subscribe, readLanguage, () => "en");
}
