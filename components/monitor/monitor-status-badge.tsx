import { Badge } from "@/components/ui/badge";
import { MONITOR_STATUS_CONFIG } from "@/shared/constants/monitor";
import type { MonitorStatus } from "@/shared/types/monitor";

interface MonitorStatusBadgeProps {
  status: MonitorStatus;
  className?: string;
}

export function MonitorStatusBadge({ status, className = "" }: MonitorStatusBadgeProps) {
  const cfg = MONITOR_STATUS_CONFIG[status];
  return (
    <Badge variant={cfg.badgeVariant} className={className}>
      {cfg.label}
    </Badge>
  );
}
