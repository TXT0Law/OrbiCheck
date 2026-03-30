"use client";

import { useEffect, useRef, useState } from "react";
import { Brain, Cpu, Loader2, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { API_PROVIDERS } from "@/lib/mock-data";

interface ProviderState {
  draft: string;
  savedKey: string | null;
  isEditing: boolean;
  isTesting: boolean;
  showSuccess: boolean;
}

type ProviderStateMap = Record<string, ProviderState>;

const providerIcons = {
  openai: Brain,
  anthropic: Sparkles,
  google: Cpu,
} as const;

function createInitialState(): ProviderStateMap {
  return API_PROVIDERS.reduce<ProviderStateMap>((acc, provider) => {
    acc[provider.id] = {
      draft: "",
      savedKey: null,
      isEditing: true,
      isTesting: false,
      showSuccess: false,
    };
    return acc;
  }, {});
}

function maskApiKey(value: string) {
  if (value.length <= 9) {
    return `${value.slice(0, 2)}****...${value.slice(-2)}`;
  }

  const trailingLength = value.length >= 12 ? 5 : 4;
  return `${value.slice(0, 5)}****...${value.slice(-trailingLength)}`;
}

export function ApiKeysSettings() {
  const [providerState, setProviderState] = useState<ProviderStateMap>(() => createInitialState());
  const timeoutIdsRef = useRef<number[]>([]);

  useEffect(() => {
    const nextState = createInitialState();

    for (const provider of API_PROVIDERS) {
      const savedValue = localStorage.getItem(provider.storageKey);
      if (savedValue) {
        nextState[provider.id] = {
          draft: "",
          savedKey: savedValue,
          isEditing: false,
          isTesting: false,
          showSuccess: false,
        };
      }
    }

    setProviderState(nextState);
  }, []);

  useEffect(() => {
    const timeoutIds = timeoutIdsRef.current;

    return () => {
      timeoutIds.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  const handleDraftChange = (providerId: string, value: string) => {
    setProviderState((prev) => ({
      ...prev,
      [providerId]: {
        ...prev[providerId],
        draft: value,
      },
    }));
  };

  const handleSave = (providerId: string) => {
    const provider = API_PROVIDERS.find((item) => item.id === providerId);
    if (!provider) {
      return;
    }

    const value = providerState[providerId]?.draft.trim();
    if (!value) {
      return;
    }

    localStorage.setItem(provider.storageKey, value);

    setProviderState((prev) => ({
      ...prev,
      [providerId]: {
        draft: "",
        savedKey: value,
        isEditing: false,
        isTesting: false,
        showSuccess: false,
      },
    }));
  };

  const handleEdit = (providerId: string) => {
    setProviderState((prev) => ({
      ...prev,
      [providerId]: {
        ...prev[providerId],
        draft: "",
        isEditing: true,
        isTesting: false,
        showSuccess: false,
      },
    }));
  };

  const handleDelete = (providerId: string) => {
    const provider = API_PROVIDERS.find((item) => item.id === providerId);
    if (!provider) {
      return;
    }

    localStorage.removeItem(provider.storageKey);

    setProviderState((prev) => ({
      ...prev,
      [providerId]: {
        draft: "",
        savedKey: null,
        isEditing: true,
        isTesting: false,
        showSuccess: false,
      },
    }));
  };

  const handleTest = (providerId: string) => {
    setProviderState((prev) => ({
      ...prev,
      [providerId]: {
        ...prev[providerId],
        isTesting: true,
        showSuccess: false,
      },
    }));

    const testingTimeoutId = window.setTimeout(() => {
      setProviderState((prev) => ({
        ...prev,
        [providerId]: {
          ...prev[providerId],
          isTesting: false,
          showSuccess: true,
        },
      }));

      const hideSuccessTimeoutId = window.setTimeout(() => {
        setProviderState((prev) => ({
          ...prev,
          [providerId]: {
            ...prev[providerId],
            showSuccess: false,
          },
        }));
      }, 3000);

      timeoutIdsRef.current.push(hideSuccessTimeoutId);
    }, 1500);

    timeoutIdsRef.current.push(testingTimeoutId);
  };

  return (
    <Card className="p-6">
      <div className="space-y-6">
        <div>
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            API Keys
          </h3>
          <p className="text-sm text-muted-foreground">
            Configure API keys for AI-powered analysis. Keys are stored locally in your browser.
          </p>
        </div>

        {API_PROVIDERS.map((provider, index) => {
          const Icon = providerIcons[provider.id as keyof typeof providerIcons] ?? Brain;
          const state = providerState[provider.id];

          if (!state) {
            return null;
          }

          return (
            <div key={provider.id} className="space-y-6">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-zinc-100 dark:bg-zinc-800">
                    <Icon className="h-4 w-4 text-zinc-600 dark:text-zinc-300" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {provider.name}
                    </p>
                    <p className="text-xs text-muted-foreground">{provider.description}</p>
                  </div>
                </div>

                {state.isEditing || !state.savedKey ? (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <Input
                      type="password"
                      value={state.draft}
                      onChange={(event) => handleDraftChange(provider.id, event.target.value)}
                      placeholder={provider.placeholder}
                      className="sm:max-w-md"
                    />
                    <Button
                      disabled={!state.draft.trim()}
                      onClick={() => handleSave(provider.id)}
                      className="bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                    >
                      Save
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                    <code className="w-fit rounded bg-zinc-100 px-2 py-1 font-mono text-sm text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100">
                      {maskApiKey(state.savedKey)}
                    </code>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        onClick={() => handleEdit(provider.id)}
                        className="h-9 border border-zinc-200 bg-white px-3 text-xs text-zinc-900 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                      >
                        Edit
                      </Button>
                      <Button
                        onClick={() => handleTest(provider.id)}
                        disabled={state.isTesting}
                        className="h-9 border border-zinc-200 bg-white px-3 text-xs text-zinc-900 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                      >
                        {state.isTesting ? (
                          <span className="inline-flex items-center gap-1">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Testing...
                          </span>
                        ) : (
                          "Test"
                        )}
                      </Button>
                      <Button
                        onClick={() => handleDelete(provider.id)}
                        className="h-9 px-3 text-xs text-red-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
                      >
                        Delete
                      </Button>
                    </div>
                    {state.showSuccess ? (
                      <p className="text-sm text-green-600 dark:text-green-500">✓ Connection successful</p>
                    ) : null}
                  </div>
                )}
              </div>

              {index < API_PROVIDERS.length - 1 ? <Separator /> : null}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
