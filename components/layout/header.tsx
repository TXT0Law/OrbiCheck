"use client";

import { useMemo } from "react";
import { Menu, Moon, Sun } from "lucide-react";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";

import { useLogout, useUserEmail } from "@/lib/hooks/use-auth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { isAuthDevBypassEnabled } from "@/lib/auth-mode";

interface HeaderProps {
  onMenuClick?: () => void;
}

function getPageTitle(path: string): string {
  if (path === "/dashboard") return "Dashboard";
  if (path.startsWith("/dashboard/scan")) return "Scan";
  if (path.startsWith("/dashboard/monitor")) return "Monitor";
  if (path.startsWith("/dashboard/alerts")) return "Alerts";
  if (path.startsWith("/dashboard/reports")) return "Reports";
  if (path.startsWith("/dashboard/settings")) return "Settings";
  return "Dashboard";
}

export function Header({ onMenuClick }: HeaderProps) {
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const { isSubmitting: isLoggingOut, submit: submitLogout } = useLogout();
  const userEmail = useUserEmail();
  const authDevBypassEnabled = isAuthDevBypassEnabled();

  const initial = useMemo(() => userEmail.charAt(0).toUpperCase() || "U", [userEmail]);
  const pageTitle = getPageTitle(pathname);

  const toggleTheme = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  };

  return (
    <header className="h-14 border-b border-border bg-card px-6">
      <div className="flex h-full items-center justify-between">
        <div className="flex items-center gap-3">
          {onMenuClick ? (
            <button
              type="button"
              onClick={onMenuClick}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:hidden"
              aria-label="Open navigation"
            >
              <Menu className="h-4 w-4" />
            </button>
          ) : null}
          <p className="text-sm font-medium text-foreground">{pageTitle}</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={toggleTheme}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Toggle theme"
          >
            {resolvedTheme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          {authDevBypassEnabled ? (
            <Avatar aria-label="Development mode">
              <AvatarFallback>{initial}</AvatarFallback>
            </Avatar>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger>
                <Avatar>
                  <AvatarFallback>{initial}</AvatarFallback>
                </Avatar>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <div className="px-2 py-1.5 text-sm text-muted-foreground">{userEmail}</div>
                <DropdownMenuItem
                  disabled={isLoggingOut}
                  onClick={() => {
                    void submitLogout();
                  }}
                >
                  {isLoggingOut ? "Signing out..." : "Sign out"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </header>
  );
}