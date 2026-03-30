/**
 * Normalize Node dns.resolveCaa / dns.promises.resolveCaa records to display strings.
 * Shape from Node: { critical, issue?, issuewild?, iodef? } (strings for tag values).
 */
export function formatCaaRecords(records) {
  if (!Array.isArray(records)) {
    return [];
  }
  return records.map((rec) => {
    if (typeof rec === 'string') {
      return rec;
    }
    if (!rec || typeof rec !== 'object') {
      return String(rec);
    }
    const critical = rec.critical ?? rec.flags ?? 0;
    const parts = [String(critical)];
    if (rec.issue != null) {
      parts.push(`issue "${rec.issue}"`);
    }
    if (rec.issuewild != null) {
      parts.push(`issuewild "${rec.issuewild}"`);
    }
    if (rec.iodef != null) {
      parts.push(`iodef "${rec.iodef}"`);
    }
    return parts.join(' ');
  });
}
