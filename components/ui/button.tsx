import * as React from "react";

import { cn } from "@/lib/utils";

const variantClasses = (variant: "default" | "outline" | "destructive") => {
  if (variant === "outline")
    return "border-2 border-zinc-400 bg-white text-zinc-900 hover:bg-zinc-100 dark:border-zinc-500 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700";
  if (variant === "destructive")
    return "bg-red-600 text-white hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700";
  return "bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200";
};

const sizeClasses = (size: "default" | "sm" | "lg") => {
  if (size === "sm") return "h-9 min-h-9 px-3.5 text-sm";
  if (size === "lg") return "h-11 min-h-11 px-6 text-base font-semibold";
  return "h-10 min-h-10 px-4 text-sm";
};

export function buttonVariants(opts?: {
  variant?: "default" | "outline" | "destructive";
  size?: "default" | "sm" | "lg";
}) {
  const variant = opts?.variant ?? "default";
  const size = opts?.size ?? "default";
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-950 disabled:pointer-events-none disabled:opacity-50",
    sizeClasses(size),
    variantClasses(variant)
  );
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "outline" | "destructive";
  size?: "default" | "sm" | "lg";
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className = "",
      type = "button",
      variant = "default",
      size = "default",
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";