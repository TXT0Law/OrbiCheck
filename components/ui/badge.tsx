import * as React from "react";

type BadgeVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "outline"
  | "success"
  | "warning"
  | "info";

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: BadgeVariant;
}

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  default: "border-transparent bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900",
  secondary:
    "border-transparent bg-zinc-200 text-zinc-900 dark:bg-zinc-600 dark:text-white",
  destructive: "border-transparent bg-red-600 text-white shadow-sm dark:bg-red-600",
  outline:
    "border-2 border-zinc-400 bg-zinc-50 text-zinc-800 dark:border-zinc-500 dark:bg-zinc-900/80 dark:text-zinc-100",
  success:
    "border-transparent bg-emerald-600 text-white shadow-sm dark:bg-emerald-600 dark:text-white",
  warning:
    "border-transparent bg-amber-500 text-zinc-950 shadow-sm dark:bg-amber-500 dark:text-zinc-950",
  info: "border-transparent bg-sky-600 text-white shadow-sm dark:bg-sky-500 dark:text-white",
};

export function Badge({ className = "", variant = "default", ...props }: BadgeProps) {
  return (
    <div
      className={`inline-flex min-h-6 items-center rounded-full border px-3 py-1 text-sm font-semibold leading-none transition-colors ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    />
  );
}
