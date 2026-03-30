import * as React from "react";

type DivProps = React.HTMLAttributes<HTMLDivElement>;

export const ScrollArea = React.forwardRef<HTMLDivElement, DivProps>(
  ({ className = "", children, ...props }, ref) => {
    return (
      <div ref={ref} className={`relative overflow-auto ${className}`} {...props}>
        {children}
      </div>
    );
  }
);

ScrollArea.displayName = "ScrollArea";
