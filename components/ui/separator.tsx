import * as React from "react";

interface SeparatorProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: "horizontal" | "vertical";
}

export function Separator({ className = "", orientation = "horizontal", ...props }: SeparatorProps) {
  if (orientation === "vertical") {
    return <div className={`h-full w-px bg-zinc-200 dark:bg-zinc-800 ${className}`} {...props} />;
  }

  return <div className={`h-px w-full bg-zinc-200 dark:bg-zinc-800 ${className}`} {...props} />;
}
