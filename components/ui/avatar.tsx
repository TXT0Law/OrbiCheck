import * as React from "react";

type DivProps = React.HTMLAttributes<HTMLDivElement>;

export const Avatar = React.forwardRef<HTMLDivElement, DivProps>(({ className = "", ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={`relative flex h-8 w-8 shrink-0 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800 ${className}`}
      {...props}
    />
  );
});

Avatar.displayName = "Avatar";

export const AvatarFallback = React.forwardRef<HTMLDivElement, DivProps>(
  ({ className = "", ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={`flex h-full w-full items-center justify-center rounded-full text-xs font-medium text-zinc-700 dark:text-zinc-200 ${className}`}
        {...props}
      />
    );
  }
);

AvatarFallback.displayName = "AvatarFallback";