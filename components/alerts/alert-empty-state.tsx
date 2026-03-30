"use client";

import { BellOff } from "lucide-react";

interface AlertEmptyStateProps {
  title: string;
  description: string;
}

export function AlertEmptyState({ title, description }: AlertEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center dark:border-zinc-700 dark:bg-zinc-950">
      <div className="mb-4 rounded-full bg-zinc-100 p-4 dark:bg-zinc-900">
        <BellOff className="h-8 w-8 text-zinc-500 dark:text-zinc-300" aria-hidden />
      </div>
      <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{title}</h3>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
