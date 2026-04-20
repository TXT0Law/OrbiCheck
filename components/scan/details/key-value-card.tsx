import type { ReactNode } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface KeyValueItem {
  label: string;
  value: ReactNode;
}

interface KeyValueCardProps {
  title: string;
  items: KeyValueItem[];
}

export function KeyValueCard({ title, items }: KeyValueCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {items.map((item) => (
            <div key={item.label} className="min-w-0 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{item.label}</p>
              <div className="mt-1 min-w-0 break-all text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {item.value}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
