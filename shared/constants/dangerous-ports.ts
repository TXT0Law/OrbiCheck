/**
 * Canonical list of port numbers considered high-risk when found open on a
 * publicly reachable host. Shared between frontend (Ports detail UI &
 * dangerous-ports chart) and backend (recommendations.py) so the heuristic
 * stays consistent across web and offline reports.
 *
 * Source rationale:
 *   21  FTP            — cleartext credentials
 *   23  Telnet         — cleartext shell
 *   445 SMB            — historical RCE / WannaCry surface
 *   3389 RDP           — credential brute force / BlueKeep family
 */
export const DANGEROUS_PORT_NUMBERS: readonly number[] = [21, 23, 445, 3389];

/** Convenience `Set` for O(1) membership tests in chart/UI code. */
export const DANGEROUS_PORTS = new Set<number>(DANGEROUS_PORT_NUMBERS);
