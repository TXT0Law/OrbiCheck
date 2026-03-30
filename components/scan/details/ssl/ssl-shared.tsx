import { Badge } from "@/components/ui/badge";

const KNOWN_SSL_GRADES = new Set(["A+", "A", "B", "C", "D", "F"]);

export function GradeBadge({ grade }: { grade?: string | null }) {
  const GRADE_COLORS: Record<string, string> = {
    "A+": "bg-green-500 text-white",
    A: "bg-green-400 text-white",
    B: "bg-yellow-400 text-black",
    C: "bg-orange-400 text-white",
    D: "bg-red-400 text-white",
    F: "bg-red-600 text-white",
  };

  const g = (grade ?? "").trim();
  const label = g && KNOWN_SSL_GRADES.has(g) ? g : "—";
  const colorClass =
    label !== "—"
      ? (GRADE_COLORS[g] ?? "bg-zinc-500 text-white")
      : "bg-zinc-500/20 text-zinc-600 dark:bg-zinc-500/25 dark:text-zinc-400";

  return (
    <span
      className={`inline-flex h-10 min-w-10 items-center justify-center rounded-lg px-1 text-lg font-bold ${colorClass}`}
    >
      {label}
    </span>
  );
}

export function StatusBadge({
  ok,
  labelOk,
  labelFail,
}: {
  ok: boolean;
  labelOk: string;
  labelFail: string;
}) {
  return (
    <Badge variant={ok ? "default" : "destructive"}>
      {ok ? labelOk : labelFail}
    </Badge>
  );
}

export function VulnStatusBadge({
  status,
}: {
  status: "vulnerable" | "not-vulnerable" | "unknown";
}) {
  const CONFIG = {
    vulnerable: { variant: "destructive" as const, label: "Vulnerable" },
    "not-vulnerable": { variant: "default" as const, label: "Not Vulnerable" },
    unknown: { variant: "outline" as const, label: "Unknown" },
  };
  const { variant, label } = CONFIG[status];
  return <Badge variant={variant}>{label}</Badge>;
}

export function InfoItem({
  label,
  value,
  variant = "default",
  wrap = false,
}: {
  label: string;
  value: string;
  variant?: "default" | "warning";
  wrap?: boolean;
}) {
  return (
    <div className={wrap ? "min-w-0" : ""}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`text-sm font-medium ${
          variant === "warning" ? "text-orange-500" : ""
        } ${wrap ? "break-all font-mono" : ""}`}
      >
        {value}
      </p>
    </div>
  );
}

export function formatDate(dateStr: string | null | undefined): string {
  if (dateStr == null || String(dateStr).trim() === "") {
    return "N/A";
  }
  const raw = String(dateStr).trim();
  try {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) {
      return "N/A";
    }
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "N/A";
  }
}

export function formatMaxAge(seconds: number): string {
  const SECONDS_PER_DAY = 86400;
  const days = Math.floor(seconds / SECONDS_PER_DAY);
  if (days >= 365) {
    return `${Math.floor(days / 365)} year(s)`;
  }
  return `${days} day(s)`;
}

export function formatExtensionName(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}
