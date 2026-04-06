"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Bell,
  FileText,
  LayoutDashboard,
  Search,
  Settings,
} from "lucide-react";

import { AlertCountBadge } from "@/components/alerts/alert-count-badge";
import OrbiCheckLogo from "@/components/icon/OrbiCheck.png";
import { getUserEmail } from "@/lib/auth";
import { cn } from "@/lib/utils";

interface NavChild {
  label: string;
  href: string;
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  soon: boolean;
  children?: NavChild[];
  section?: "main" | "settings";
}

const navItems: NavItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    soon: false,
    section: "main",
  },
  {
    label: "Scan",
    href: "/dashboard/scan",
    icon: Search,
    soon: false,
    section: "main",
    children: [
      { label: "Scan List", href: "/dashboard/scan" },
      { label: "Groups", href: "/dashboard/scan/groups" },
    ],
  },
  { label: "Monitor", href: "/dashboard/monitor", icon: Activity, soon: false, section: "main" },
  { label: "Alerts", href: "/dashboard/alerts", icon: Bell, soon: false, section: "main" },
  { label: "Reports", href: "/dashboard/reports", icon: FileText, soon: false, section: "main" },
  {
    label: "Settings",
    href: "/dashboard/settings",
    icon: Settings,
    soon: false,
    section: "settings",
  },
] as const;

function isNavItemActive(pathname: string, href: string) {
  if (href === "/dashboard") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

interface SidebarContentProps {
  onClose?: () => void;
  className?: string;
}

function renderNavBadge(item: NavItem) {
  if (item.href === "/dashboard/alerts") {
    return <AlertCountBadge />;
  }

  if (item.soon) {
    return (
      <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:bg-zinc-800 dark:text-zinc-300">
        Soon
      </span>
    );
  }

  return null;
}

function SidebarNavSection({
  items,
  pathname,
  onClose,
}: {
  items: NavItem[];
  pathname: string;
  onClose?: () => void;
}) {
  return items.map((item) => {
    const Icon = item.icon;
    const isActive = isNavItemActive(pathname, item.href);
    const hasChildren = "children" in item && item.children?.length;

    return (
      <div key={item.href}>
        <Link
          href={item.href}
          onClick={onClose}
          className={`flex items-center justify-between rounded-md px-3 py-2 text-sm transition-colors ${
            isActive
              ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-white"
              : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:hover:text-white"
          }`}
        >
          <span className="flex items-center gap-2">
            <Icon className="h-4 w-4" />
            {item.label}
          </span>
          {renderNavBadge(item)}
        </Link>
        {hasChildren &&
          item.children?.map((child) => (
            <Link
              key={child.href}
              href={child.href}
              onClick={onClose}
              className={`ml-6 flex items-center rounded-md px-3 py-2 text-sm transition-colors ${
                pathname === child.href
                  ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-white"
                  : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:hover:text-white"
              }`}
            >
              {child.label}
            </Link>
          ))}
      </div>
    );
  });
}

export function SidebarContent({ onClose, className }: SidebarContentProps) {
  const pathname = usePathname();
  const userEmail = getUserEmail();
  const mainItems = navItems.filter((item) => item.section !== "settings");
  const settingsItems = navItems.filter((item) => item.section === "settings");

  return (
    <div
      className={cn(
        "flex h-full w-[240px] flex-col border-r border-zinc-200 bg-white text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200",
        className
      )}
    >
      <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
        <div className="flex items-center gap-3">
          <Image
            src={OrbiCheckLogo}
            alt="OrbiCheck logo"
            width={36}
            height={36}
            priority
            className="h-9 w-9 rounded-md object-cover"
          />
          <div>
            <p className="text-base font-semibold text-zinc-900 dark:text-white">OrbiCheck</p>
            <p className="text-xs text-muted-foreground">v0.1.0</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        <SidebarNavSection items={mainItems} pathname={pathname} onClose={onClose} />

        <div className="my-3 h-px bg-zinc-200 dark:bg-zinc-800" />

        <SidebarNavSection items={settingsItems} pathname={pathname} onClose={onClose} />
      </nav>

      <div className="border-t border-zinc-200 px-5 py-4 dark:border-zinc-800">
        <p className="truncate text-xs text-muted-foreground">
          {userEmail}
        </p>
      </div>
    </div>
  );
}

export function Sidebar() {
  return (
    <aside className="fixed left-0 z-30 hidden h-[calc(100vh-var(--demo-bar-height,0px))] top-[var(--demo-bar-height,0px)] md:flex">
      <SidebarContent />
    </aside>
  );
}