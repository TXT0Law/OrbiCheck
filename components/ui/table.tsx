import * as React from "react";

export const Table = React.forwardRef<HTMLTableElement, React.TableHTMLAttributes<HTMLTableElement>>(
  ({ className = "", ...props }, ref) => {
    return <table ref={ref} className={`w-full caption-bottom text-sm ${className}`} {...props} />;
  }
);

Table.displayName = "Table";

export const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className = "", ...props }, ref) => {
  return <thead ref={ref} className={`${className}`} {...props} />;
});

TableHeader.displayName = "TableHeader";

export const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className = "", ...props }, ref) => {
  return <tbody ref={ref} className={`${className}`} {...props} />;
});

TableBody.displayName = "TableBody";

export const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className = "", ...props }, ref) => {
    return <tr ref={ref} className={`border-b border-zinc-200 dark:border-zinc-800 ${className}`} {...props} />;
  }
);

TableRow.displayName = "TableRow";

export const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className = "", ...props }, ref) => {
    return (
      <th
        ref={ref}
        className={`h-10 px-3 text-left align-middle font-medium text-muted-foreground ${className}`}
        {...props}
      />
    );
  }
);

TableHead.displayName = "TableHead";

export const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className = "", ...props }, ref) => {
    return (
      <td
        ref={ref}
        className={`px-3 py-2 align-middle text-foreground ${className}`}
        {...props}
      />
    );
  }
);

TableCell.displayName = "TableCell";
