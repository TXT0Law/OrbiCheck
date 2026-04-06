"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, Shield, Globe, FileText, LayoutDashboard } from "lucide-react";
import { useState, type ComponentType } from "react";

import { ScrollArea } from "@/components/ui/scroll-area";
import {
  SCAN_SUB_NAV_GROUPS,
  type ScanSubNavGroupDef,
  type SubNavIconKey,
} from "@/lib/constants/scan-module-routes";

const SUB_NAV_ICONS: Record<SubNavIconKey, ComponentType<{ className?: string }>> = {
  layout: LayoutDashboard,
  shield: Shield,
  globe: Globe,
  file: FileText,
};

function isNavItemActive(pathname: string, pathWithoutHash: string) {
  return pathname === pathWithoutHash || pathname.startsWith(`${pathWithoutHash}/`);
}

function navHref(
  scanRootHref: string,
  item: ScanSubNavGroupDef["items"][number]
): { href: string; pathForActive: string } {
  if (!item.segment) {
    return { href: scanRootHref, pathForActive: scanRootHref };
  }
  const pathForActive = `${scanRootHref}/${item.segment}`;
  const hash = item.hrefHash ?? "";
  return { href: `${pathForActive}${hash}`, pathForActive };
}

interface SubNavProps {
  scanId: string;
  domain: string;
}

export function SubNav({ scanId, domain }: SubNavProps) {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const scanRootHref = `/dashboard/scan/${scanId}`;

  return (
    <aside className="w-full border-b border-zinc-800 bg-zinc-950 text-zinc-300 md:fixed md:left-0 md:top-0 md:z-30 md:h-screen md:w-[260px] md:border-r md:border-b-0">
      <div className="border-b border-zinc-800 px-4 py-4">
        <Link
          href="/dashboard/scan"
          className="inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm text-zinc-400 transition hover:bg-zinc-900 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Scans
        </Link>
        <p className="mt-3 text-xs uppercase tracking-wide text-zinc-400">Scanned Domain</p>
        <p className="mt-1 truncate text-sm font-semibold text-white">{domain}</p>
        <button
          type="button"
          onClick={() => setMobileNavOpen((open) => !open)}
          className="mt-2 flex items-center gap-1 text-xs text-zinc-400 md:hidden"
        >
          {mobileNavOpen ? "Hide modules ▲" : "Show modules ▼"}
        </button>
      </div>

      <div className={`${mobileNavOpen ? "block" : "hidden"} md:block`}>
        <ScrollArea className="max-h-[30vh] px-3 py-4 md:h-[calc(100vh-110px)] md:max-h-none">
          <div className="space-y-5 pb-4">
            {SCAN_SUB_NAV_GROUPS.map((group) => {
              const GroupIcon = SUB_NAV_ICONS[group.icon];

              return (
                <section key={group.title}>
                  <div className="mb-2 flex items-center gap-2 px-2">
                    <GroupIcon className="h-3.5 w-3.5 text-zinc-400" />
                    <p className="text-[11px] uppercase tracking-wide text-zinc-400">{group.title}</p>
                  </div>

                  <div className="space-y-1">
                    {group.items.map((item) => {
                      const { href, pathForActive } = navHref(scanRootHref, item);
                      const isActive = isNavItemActive(pathname, pathForActive);

                      return (
                        <Link
                          key={item.label}
                          href={href}
                          aria-current={isActive ? "page" : undefined}
                          className={`flex items-center justify-between rounded-md px-3 py-2 text-sm transition-colors ${
                            isActive
                              ? "bg-zinc-800 text-white"
                              : "text-zinc-400 hover:bg-zinc-900 hover:text-white"
                          }`}
                        >
                          <span>{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </ScrollArea>
      </div>
    </aside>
  );
}
