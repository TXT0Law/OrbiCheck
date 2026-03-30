"use client";

import * as React from "react";

const DropdownMenuContext = React.createContext<{
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
} | null>(null);

function useDropdownMenuContext() {
  const context = React.useContext(DropdownMenuContext);

  if (!context) {
    throw new Error("DropdownMenu components must be used within DropdownMenu");
  }

  return context;
}

export function DropdownMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  return (
    <DropdownMenuContext.Provider value={{ open, setOpen }}>
      <div ref={menuRef} className="relative">
        {children}
      </div>
    </DropdownMenuContext.Provider>
  );
}

export function DropdownMenuTrigger({ children }: { children: React.ReactNode }) {
  const { open, setOpen } = useDropdownMenuContext();

  return (
    <button
      type="button"
      onClick={() => setOpen((prev) => !prev)}
      className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
      aria-haspopup="menu"
      aria-expanded={open}
    >
      {children}
    </button>
  );
}

export function DropdownMenuContent({ children }: { children: React.ReactNode }) {
  const { open } = useDropdownMenuContext();

  if (!open) {
    return null;
  }

  return (
    <div
      role="menu"
      className="absolute right-0 z-50 mt-2 min-w-48 rounded-md border border-zinc-200 bg-white p-1 shadow-md dark:border-zinc-800 dark:bg-zinc-900"
      onMouseDown={(e) => {
        // Keep menu mounted through mousedown→click so item handlers run; also avoids
        // document-level outside-click from treating in-menu events incorrectly.
        e.stopPropagation();
      }}
    >
      {children}
    </div>
  );
}

export function DropdownMenuItem({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const { setOpen } = useDropdownMenuContext();

  const onSelect = () => {
    if (disabled) return;
    onClick?.();
    setOpen(false);
  };

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className="flex w-full items-center rounded-md px-3 py-2.5 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-100 disabled:pointer-events-none disabled:opacity-50 dark:text-zinc-100 dark:hover:bg-zinc-800"
    >
      {children}
    </button>
  );
}

export function DropdownMenuSeparator() {
  return <div className="my-1 h-px bg-zinc-200 dark:bg-zinc-800" />;
}