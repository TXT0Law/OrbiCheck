import { z } from "zod";

import { ApiError } from "./client";

/**
 * Boundary-validation helpers shared across every typed `lib/api/*` client.
 *
 * `lib/AGENTS.md` requires every wire-level payload to be re-validated by Zod
 * before it crosses into the strict shared TypeScript shape — both
 * `parseSingle` and `parseList` were duplicated near-verbatim across
 * `monitors.ts`, `monitor-dns.ts`, `monitor-ct.ts`, and
 * `maintenance-windows.ts` (Phase 2b code review item P2-1). Centralising the
 * helpers here keeps every endpoint's failure mode identical:
 *
 * * HTTP status `502` (origin returned an unparseable shape)
 * * `code = "INVALID_RESPONSE_SHAPE"` so the React Query layer can render a
 *   single, consistent toast instead of one-off error strings per endpoint
 * * Zod issue list attached for debugging via the existing `ApiError.details`
 *
 * Keeping the public surface tiny on purpose — we do **not** export
 * `parseOrThrow` because the typed wrappers below are the only call sites
 * that should exist; adding a third would invite drift again.
 */

const INVALID_RESPONSE_STATUS = 502;
const INVALID_RESPONSE_CODE = "INVALID_RESPONSE_SHAPE";

/**
 * Parse `data` against `schema` and throw a structured `ApiError` on failure.
 * Exported so callers that need the raw inferred Zod type (e.g. discriminated
 * unions whose `as unknown as T` cast in `parseSingle` would lose precision)
 * can use it directly while still routing through the same `502 /
 * INVALID_RESPONSE_SHAPE` envelope as the rest of the API client.
 */
export function parseOrThrow<T>(
  schema: z.ZodType<T>,
  data: unknown,
  context: string,
): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ApiError(`Invalid ${context} response from server`, {
      status: INVALID_RESPONSE_STATUS,
      code: INVALID_RESPONSE_CODE,
      details: result.error.issues,
    });
  }
  return result.data;
}

/**
 * Validate a single object payload then narrow to the strict shared TS type.
 *
 * Zod's inferred type tolerates passthrough keys; the strict `T` parameter
 * lets callers stay typed without `as Foo` assertions in the body of every
 * endpoint (which would defeat the validation contract in `lib/AGENTS.md`).
 */
export function parseSingle<T>(
  schema: z.ZodTypeAny,
  raw: unknown,
  context: string,
): T {
  const validated = parseOrThrow(schema as z.ZodType<unknown>, raw, context);
  return validated as unknown as T;
}

/**
 * Validate an array payload by wrapping the per-item schema in `z.array(...)`
 * before delegating to `parseSingle`. Returns an empty array when the
 * payload itself is `[]` and the schema accepts it.
 */
export function parseList<T>(
  itemSchema: z.ZodTypeAny,
  raw: unknown,
  context: string,
): T[] {
  const validated = parseOrThrow(
    z.array(itemSchema as z.ZodType<unknown>),
    raw,
    context,
  );
  return validated as unknown as T[];
}
