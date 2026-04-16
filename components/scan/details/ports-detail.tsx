import * as React from "react";

import { ChevronDown, ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type {
  OsDetection,
  PortResult,
  PortsResult,
  ScanStats,
  TracerouteHop,
} from "@/shared/types/scan";

interface PortsDetailProps {
  data: PortsResult | null | undefined;
}

const DANGEROUS_PORTS = new Set([21, 23, 445, 3389]);
const PORT_FILTERS = [
  { id: "open", label: "Open" },
  { id: "all", label: "All" },
  { id: "closed", label: "Closed" },
  { id: "filtered", label: "Filtered" },
] as const;

type PortFilter = (typeof PORT_FILTERS)[number]["id"];

function sortPorts(data: PortResult[]) {
  return [...data].sort((left, right) => left.port - right.port);
}

function summarizePorts(data: PortResult[]) {
  return data.reduce(
    (summary, port) => {
      summary[port.state] += 1;
      return summary;
    },
    { open: 0, filtered: 0, closed: 0 },
  );
}

function stateBadgeClass(state: PortResult["state"]) {
  if (state === "open") {
    return "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200";
  }
  if (state === "closed") {
    return "border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200";
  }
  return "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200";
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days > 0) return `~${days}d ${hours}h`;
  if (hours > 0) return `~${hours}h`;
  return `~${Math.floor(seconds / 60)}m`;
}

function formatLatency(latency?: number | null): string | null {
  if (latency == null || Number.isNaN(latency)) {
    return null;
  }
  return `${(latency / 1000).toFixed(3)}s`;
}

function formatDuration(data: PortsResult): string | null {
  if (data.scanStats?.elapsedSeconds != null) {
    return `${data.scanStats.elapsedSeconds.toFixed(2)}s`;
  }
  if (data.durationMs != null) {
    return `${(data.durationMs / 1000).toFixed(2)}s`;
  }
  return null;
}

function buildNotShownSummary(data: PortsResult, counts: ReturnType<typeof summarizePorts>): string | null {
  const rawSummary = data.scanSummary?.notShown?.trim();
  if (rawSummary) {
    return rawSummary;
  }

  const parts: string[] = [];
  if (counts.closed > 0) {
    parts.push(`${counts.closed} closed ports`);
  }
  if (counts.filtered > 0) {
    parts.push(`${counts.filtered} filtered ports`);
  }
  if (parts.length === 0) {
    return null;
  }
  return `Not shown: ${parts.join(", ")}.`;
}

function getVisibleEntries(entries: PortResult[], filter: PortFilter) {
  if (filter === "all") {
    return entries;
  }
  return entries.filter((entry) => entry.state === filter);
}

function emptyMessageForFilter(filter: PortFilter) {
  if (filter === "open") {
    return "No open ports detected.";
  }
  if (filter === "closed") {
    return "No closed ports detected.";
  }
  if (filter === "filtered") {
    return "No filtered ports detected.";
  }
  return "No ports match this filter.";
}

function TechCell({ entry }: { entry: PortResult }) {
  const [expanded, setExpanded] = React.useState(false);
  const parts: string[] = [];
  if (entry.product) parts.push(entry.product);
  if (entry.version && entry.version !== entry.product) parts.push(entry.version);
  if (entry.extraInfo) parts.push(`(${entry.extraInfo})`);

  const techLine = parts.length > 0 ? parts.join(" ") : entry.banner || "—";
  const scripts = entry.scripts;
  const hasScripts = scripts && Object.keys(scripts).length > 0;
  const maxLength = 120;
  const isLong = techLine.length > maxLength;
  const shown = isLong && !expanded ? `${techLine.slice(0, maxLength)}…` : techLine;

  return (
    <div className="max-w-sm">
      <code className="text-xs font-mono break-all text-muted-foreground">{shown}</code>
      {isLong ? (
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="ml-1 text-xs text-blue-500 hover:underline"
        >
          {expanded ? "Less" : "More"}
        </button>
      ) : null}
      {hasScripts && expanded ? (
        <div className="mt-1 space-y-1">
          {Object.entries(scripts).map(([id, output]) => (
            <div key={id} className="rounded bg-muted/50 px-2 py-1 text-xs">
              <span className="font-semibold text-foreground">{id}:</span>{" "}
              <span className="text-muted-foreground">{output}</span>
            </div>
          ))}
        </div>
      ) : hasScripts ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="ml-1 text-xs text-blue-500 hover:underline"
        >
          +{Object.keys(scripts).length} script{Object.keys(scripts).length > 1 ? "s" : ""}
        </button>
      ) : null}
    </div>
  );
}

function StateBadge({ state }: { state: PortResult["state"] }) {
  return (
    <Badge variant="outline" className={stateBadgeClass(state)}>
      {state}
    </Badge>
  );
}

function CollapsibleSection({
  title,
  defaultOpen,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(defaultOpen ?? false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted/50">
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        {title}
      </CollapsibleTrigger>
      <CollapsibleContent className="px-2 pb-2 pt-1">{children}</CollapsibleContent>
    </Collapsible>
  );
}

function PortsTable({
  entries,
  emptyCopy,
}: {
  entries: PortResult[];
  emptyCopy: string;
}) {
  if (entries.length === 0) {
    return <div className="py-2 text-sm text-muted-foreground">{emptyCopy}</div>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Port</TableHead>
          <TableHead>Protocol</TableHead>
          <TableHead>Service</TableHead>
          <TableHead>State</TableHead>
          <TableHead>Reason</TableHead>
          <TableHead>Tech Detection</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => (
          <TableRow key={`${entry.protocol}-${entry.port}-${entry.state}`}>
            <TableCell className="font-medium">{entry.port}</TableCell>
            <TableCell className="uppercase">{entry.protocol}</TableCell>
            <TableCell>{entry.service}</TableCell>
            <TableCell>
              <StateBadge state={entry.state} />
            </TableCell>
            <TableCell className="text-xs text-muted-foreground">{entry.reason || "—"}</TableCell>
            <TableCell>
              <TechCell entry={entry} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function OsDetectionSection({ data }: { data: OsDetection }) {
  const topMatch = data.osMatches?.[0];

  return (
    <CollapsibleSection title="OS Detection" defaultOpen>
      <div className="space-y-2 text-sm">
        {data.deviceType ? (
          <div className="flex gap-2">
            <span className="w-36 shrink-0 font-medium text-muted-foreground">Device Type</span>
            <span>{data.deviceType}</span>
          </div>
        ) : null}

        {topMatch ? (
          <div className="flex gap-2">
            <span className="w-36 shrink-0 font-medium text-muted-foreground">OS</span>
            <span>
              {topMatch.name}
              <span className="ml-1 text-xs text-muted-foreground">
                ({topMatch.accuracy}% confidence)
              </span>
            </span>
          </div>
        ) : null}

        {data.osMatches && data.osMatches.length > 1 ? (
          <div className="flex gap-2">
            <span className="w-36 shrink-0 font-medium text-muted-foreground">Alternatives</span>
            <span className="text-xs text-muted-foreground">
              {data.osMatches
                .slice(1, 4)
                .map((match) => `${match.name} (${match.accuracy}%)`)
                .join(", ")}
            </span>
          </div>
        ) : null}

        {topMatch?.osClasses && topMatch.osClasses.length > 0 ? (
          <div className="flex gap-2">
            <span className="w-36 shrink-0 font-medium text-muted-foreground">OS Class</span>
            <span className="text-xs">
              {topMatch.osClasses
                .map((osClass) => [osClass.vendor, osClass.osFamily, osClass.osGen]
                  .filter(Boolean)
                  .join(" "))
                .join(" | ")}
            </span>
          </div>
        ) : null}

        {data.uptimeSeconds != null && data.uptimeSeconds > 0 ? (
          <div className="flex gap-2">
            <span className="w-36 shrink-0 font-medium text-muted-foreground">Uptime Guess</span>
            <span>
              {formatUptime(data.uptimeSeconds)}
              {data.uptimeLastBoot ? (
                <span className="ml-1 text-xs text-muted-foreground">
                  (since {data.uptimeLastBoot})
                </span>
              ) : null}
            </span>
          </div>
        ) : null}

        {data.tcpSequenceDifficulty != null ? (
          <div className="flex gap-2">
            <span className="w-36 shrink-0 font-medium text-muted-foreground">
              TCP Seq Prediction
            </span>
            <span>
              Difficulty={data.tcpSequenceDifficulty}
              {data.tcpSequenceDescription ? (
                <span className="ml-1 text-muted-foreground">
                  ({data.tcpSequenceDescription})
                </span>
              ) : null}
            </span>
          </div>
        ) : null}

        {data.ipIdSequence ? (
          <div className="flex gap-2">
            <span className="w-36 shrink-0 font-medium text-muted-foreground">
              IP ID Sequence
            </span>
            <span>{data.ipIdSequence}</span>
          </div>
        ) : null}

        {data.tcpTsSequence ? (
          <div className="flex gap-2">
            <span className="w-36 shrink-0 font-medium text-muted-foreground">
              TCP TS Sequence
            </span>
            <span>{data.tcpTsSequence}</span>
          </div>
        ) : null}

        {data.networkDistance != null && data.networkDistance > 0 ? (
          <div className="flex gap-2">
            <span className="w-36 shrink-0 font-medium text-muted-foreground">
              Network Distance
            </span>
            <span>
              {data.networkDistance} hop{data.networkDistance !== 1 ? "s" : ""}
            </span>
          </div>
        ) : null}

        {data.fingerprint ? (
          <CollapsibleSection title="Raw OS Fingerprint">
            <code className="block max-h-40 overflow-y-auto rounded bg-muted/30 p-2 text-xs font-mono break-all text-muted-foreground">
              {data.fingerprint}
            </code>
          </CollapsibleSection>
        ) : null}
      </div>
    </CollapsibleSection>
  );
}

function TracerouteSection({ hops }: { hops: TracerouteHop[] }) {
  if (hops.length === 0) return null;

  return (
    <CollapsibleSection title={`Traceroute (${hops.length} hops)`}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">Hop</TableHead>
            <TableHead className="w-24">RTT (ms)</TableHead>
            <TableHead>Address</TableHead>
            <TableHead>Hostname</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {hops.map((hop) => (
            <TableRow key={hop.hop}>
              <TableCell className="font-medium">{hop.hop}</TableCell>
              <TableCell className="font-mono text-xs">
                {hop.rttMs != null ? hop.rttMs.toFixed(2) : "*"}
              </TableCell>
              <TableCell className="font-mono text-xs">{hop.address || "*"}</TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {hop.hostname || "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </CollapsibleSection>
  );
}

function ScanStatsSection({ stats }: { stats: ScanStats }) {
  return (
    <CollapsibleSection title="Scan Statistics">
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
        {stats.startTime ? (
          <>
            <span className="font-medium text-muted-foreground">Start Time</span>
            <span className="text-xs">{stats.startTime}</span>
          </>
        ) : null}
        {stats.endTime ? (
          <>
            <span className="font-medium text-muted-foreground">End Time</span>
            <span className="text-xs">{stats.endTime}</span>
          </>
        ) : null}
        {stats.elapsedSeconds != null ? (
          <>
            <span className="font-medium text-muted-foreground">Elapsed</span>
            <span>{stats.elapsedSeconds.toFixed(2)}s</span>
          </>
        ) : null}
        {stats.hostsUp != null ? (
          <>
            <span className="font-medium text-muted-foreground">Hosts</span>
            <span>
              {stats.hostsUp} up / {stats.hostsTotal ?? 0} total
            </span>
          </>
        ) : null}
        {stats.rawPacketsSent ? (
          <>
            <span className="font-medium text-muted-foreground">Raw Packets Sent</span>
            <span className="font-mono text-xs">{stats.rawPacketsSent}</span>
          </>
        ) : null}
        {stats.rawPacketsReceived ? (
          <>
            <span className="font-medium text-muted-foreground">Raw Packets Rcvd</span>
            <span className="font-mono text-xs">{stats.rawPacketsReceived}</span>
          </>
        ) : null}
      </div>
    </CollapsibleSection>
  );
}

export function PortsDetail({ data }: PortsDetailProps) {
  const [filter, setFilter] = React.useState<PortFilter>("open");

  if (!data || !Array.isArray(data.entries)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Open Port Scan</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Port scan data is unavailable for this scan.
        </CardContent>
      </Card>
    );
  }

  if (data.entries.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Open Port Scan</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          No port scan results were returned.
        </CardContent>
      </Card>
    );
  }

  const allEntries = sortPorts(data.entries);
  const summary = summarizePorts(allEntries);
  const openPorts = allEntries.filter((entry) => entry.state === "open");
  const closedPorts = allEntries.filter((entry) => entry.state === "closed");
  const filteredPorts = allEntries.filter((entry) => entry.state === "filtered");
  const visibleEntries = getVisibleEntries(allEntries, filter);
  const dangerousOpenPorts = openPorts
    .filter((port) => DANGEROUS_PORTS.has(port.port))
    .map((port) => port.port);
  const openRate = allEntries.length > 0 ? openPorts.length / allEntries.length : 0;
  const likelyCdnFalsePositive = data.behindProxy && openRate > 0.8;
  const latencyText = formatLatency(data.hostStatus?.latency);
  const notShownSummary = buildNotShownSummary(data, summary);
  const durationText = formatDuration(data);
  const startTime = data.startTime || data.scanStats?.startTime;
  const endTime = data.endTime || data.scanStats?.endTime;

  const hostSummaryParts: string[] = [];
  if (data.hostStatus?.up) {
    hostSummaryParts.push(
      latencyText ? `Host is up (${latencyText} latency).` : "Host is up.",
    );
  } else if (data.hostStatus?.up === false) {
    hostSummaryParts.push("Host status could not be confirmed.");
  }
  if (notShownSummary) {
    hostSummaryParts.push(notShownSummary);
  }

  const hasOsDetection = !!data.osDetection && (
    (data.osDetection.osMatches && data.osDetection.osMatches.length > 0) ||
    data.osDetection.deviceType ||
    data.osDetection.tcpSequenceDifficulty != null ||
    data.osDetection.networkDistance != null
  );
  const hasTraceroute = !!data.traceroute && data.traceroute.length > 0;
  const hasScanStats = !!data.scanStats;
  const profile = data.profile || "quick";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Open Port Scan</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 overflow-x-auto">
        <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
          {data.engine ? <Badge variant="outline">Engine: {data.engine}</Badge> : null}
          {data.profile ? <Badge variant="outline">Profile: {data.profile}</Badge> : null}
          {data.durationMs ? (
            <Badge variant="outline">Duration: {(data.durationMs / 1000).toFixed(1)}s</Badge>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
          <Badge variant="outline">{summary.open} open</Badge>
          <Badge variant="outline">{summary.closed} closed</Badge>
          <Badge variant="outline">{summary.filtered} filtered</Badge>
          {data.behindProxy ? (
            <Badge
              variant="outline"
              className="border-blue-300 text-blue-600 dark:border-blue-800 dark:text-blue-300"
            >
              Results may reflect CDN
            </Badge>
          ) : null}
        </div>

        {hostSummaryParts.length > 0 ? (
          <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
            <div>{hostSummaryParts.join(" ")}</div>
            {startTime || endTime || durationText ? (
              <div className="mt-1 text-xs">
                {startTime ? `Scan started: ${startTime}` : "Scan started: —"}
                {" | "}
                {endTime ? `Completed: ${endTime}` : "Completed: —"}
                {" | "}
                {durationText ? `Duration: ${durationText}` : "Duration: —"}
              </div>
            ) : null}
          </div>
        ) : null}

        {data.behindProxy ? (
          <div className="rounded-md border border-blue-300 bg-blue-50 px-3 py-2 text-sm text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
            <span className="font-medium">
              CDN/Proxy detected{data.proxyProvider ? ` (${data.proxyProvider})` : ""}:
            </span>{" "}
            {data.note || "Open port results may reflect the proxy infrastructure rather than the actual server."}
            {likelyCdnFalsePositive ? (
              <span className="mt-1 block text-xs">
                Port results may be unreliable — showing CDN/proxy ports rather than origin
                server ports.
              </span>
            ) : null}
          </div>
        ) : null}

        {data.detectedTechnologies && data.detectedTechnologies.length > 0 ? (
          <div className="rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-200">
            Detected technologies: {data.detectedTechnologies.join(", ")}
          </div>
        ) : null}

        {dangerousOpenPorts.length > 0 && !data.behindProxy ? (
          <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
            High-risk ports are exposed: {dangerousOpenPorts.join(", ")}.
          </div>
        ) : dangerousOpenPorts.length > 0 && data.behindProxy ? (
          <div className="rounded-md border border-yellow-300 bg-yellow-50 px-3 py-2 text-sm text-yellow-700 dark:border-yellow-900 dark:bg-yellow-950/30 dark:text-yellow-200">
            High-risk ports appear open but may be CDN ports: {dangerousOpenPorts.join(", ")}.
          </div>
        ) : null}

        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {PORT_FILTERS.map((option) => {
              const active = filter === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFilter(option.id)}
                  className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-foreground hover:bg-muted"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          <PortsTable entries={visibleEntries} emptyCopy={emptyMessageForFilter(filter)} />
        </div>

        {(closedPorts.length > 0 || filteredPorts.length > 0) ? (
          <CollapsibleSection
            title={`Closed / Filtered Details (${closedPorts.length + filteredPorts.length})`}
          >
            <div className="space-y-4">
              <div>
                <div className="mb-2 text-sm font-medium">Closed Ports</div>
                <PortsTable entries={closedPorts} emptyCopy="No closed ports detected." />
              </div>
              <div>
                <div className="mb-2 text-sm font-medium">Filtered Ports</div>
                <PortsTable entries={filteredPorts} emptyCopy="No filtered ports detected." />
              </div>
            </div>
          </CollapsibleSection>
        ) : null}

        {hasOsDetection && (profile === "standard" || profile === "deep") ? (
          <OsDetectionSection data={data.osDetection!} />
        ) : null}

        {hasTraceroute && profile === "deep" ? (
          <TracerouteSection hops={data.traceroute!} />
        ) : null}

        {hasScanStats ? <ScanStatsSection stats={data.scanStats!} /> : null}
      </CardContent>
    </Card>
  );
}
