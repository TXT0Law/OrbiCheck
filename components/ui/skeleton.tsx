import * as React from "react";

type DivProps = React.HTMLAttributes<HTMLDivElement>;

export function Skeleton({ className = "", ...props }: DivProps) {
  return <div className={`animate-pulse rounded-md bg-zinc-200 dark:bg-zinc-800 ${className}`} {...props} />;
}
