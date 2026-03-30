import { SummaryCard } from "@/components/scan/details/summary-card";
import type { CipherInfo, ProtocolInfo } from "@/shared/types/scan";

interface SslProtocolSummaryCardProps {
  protocols: ProtocolInfo[];
  basePath?: string;
}

export function SslProtocolSummaryCard({
  protocols,
  basePath,
}: SslProtocolSummaryCardProps) {
  const supported = protocols.filter((p) => p.supported).map((p) => p.name);
  const deprecated = protocols.filter((p) => !p.supported).map((p) => p.name);
  const hasInsecure = protocols.some(
    (p) => p.supported && (p.secure === "warning" || p.secure === "danger")
  );
  const hasDeprecatedDisabled = deprecated.length > 0;
  const noSupportedButHasRows =
    protocols.length > 0 && !protocols.some((p) => p.supported);
  const status: "pass" | "warn" | "fail" | "info" = hasInsecure
    ? "fail"
    : noSupportedButHasRows
      ? "fail"
      : hasDeprecatedDisabled
        ? "pass"
        : protocols.length === 0
          ? "info"
          : "pass";

  const summaryLines: string[] =
    protocols.length === 0
      ? ["Protocol data not available. View TLS page for full check."]
      : noSupportedButHasRows
        ? [
            "No supported TLS protocols reported — verify configuration on the TLS page.",
            ...(deprecated.length > 0
              ? [`Deprecated / disabled in scan: ${deprecated.join(", ")}`]
              : []),
          ]
        : [
            supported.length > 0
              ? `Supported: ${supported.join(", ")}`
              : "No supported protocols",
            deprecated.length > 0
              ? `Deprecated Disabled: ${deprecated.join(", ")}`
              : "",
          ].filter(Boolean);

  return (
    <SummaryCard
      title="Protocol Support"
      status={status}
      summaryLines={summaryLines}
      detailLink={basePath ? `${basePath}/tls` : "../tls"}
      detailLinkText="View Full Details"
    />
  );
}

interface SslCipherSummaryCardProps {
  ciphers: CipherInfo[];
  forwardSecrecy?: boolean;
  basePath?: string;
}

export function SslCipherSummaryCard({
  ciphers,
  forwardSecrecy,
  basePath,
}: SslCipherSummaryCardProps) {
  const weakCount = ciphers.filter(
    (c) => c.strength === "weak" || c.strength === "insecure"
  ).length;
  const hasWeak = weakCount > 0;
  const status: "pass" | "warn" | "fail" | "info" = hasWeak
    ? "warn"
    : forwardSecrecy === false
      ? "warn"
      : ciphers.length === 0
        ? "info"
        : "pass";

  const summaryLines: string[] =
    ciphers.length === 0
      ? ["Cipher data not available. View TLS page for full check."]
      : [
          `Total: ${ciphers.length} suites`,
          forwardSecrecy !== undefined
            ? `Forward Secrecy: ${
                forwardSecrecy ? "All suites support" : "Not all support"
              }`
            : "",
          hasWeak
            ? `Weak Ciphers: ${weakCount} detected`
            : "Weak Ciphers: None detected",
        ].filter(Boolean);

  return (
    <SummaryCard
      title="Cipher Suites"
      status={status}
      summaryLines={summaryLines}
      detailLink={basePath ? `${basePath}/tls` : "../tls"}
      detailLinkText="View Full Details"
    />
  );
}
