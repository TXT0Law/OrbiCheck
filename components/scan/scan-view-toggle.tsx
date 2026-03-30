"use client";

import { LayoutList, FolderOpen } from "lucide-react";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type ScanViewMode = "flat" | "group";

interface ScanViewToggleProps {
  mode: ScanViewMode;
  onChange: (mode: ScanViewMode) => void;
}

export function ScanViewToggle({ mode, onChange }: ScanViewToggleProps) {
  return (
    <Tabs
      value={mode}
      defaultValue="flat"
      onValueChange={(v) => onChange(v as ScanViewMode)}
      className="inline-flex"
    >
      <TabsList>
        <TabsTrigger value="flat" className="gap-1.5">
          <LayoutList className="h-4 w-4" />
          Flat List
        </TabsTrigger>
        <TabsTrigger value="group" className="gap-1.5">
          <FolderOpen className="h-4 w-4" />
          By Group
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
