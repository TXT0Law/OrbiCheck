// Standard envelope helpers. All scan modules should produce results in the
// shape `{ success, data, error?, durationMs, statusCode? }` so the runner,
// transformers, and frontend can rely on a single contract.

const STANDARD_OK_STATUS = 200;
const STANDARD_ERROR_STATUS = 500;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function ok(data, durationMs, extras = {}) {
  return {
    success: true,
    data: data ?? null,
    durationMs: Math.max(0, Number.isFinite(durationMs) ? Math.round(durationMs) : 0),
    statusCode: STANDARD_OK_STATUS,
    ...extras,
  };
}

export function err(message, durationMs, extras = {}) {
  return {
    success: false,
    data: null,
    error: typeof message === 'string' && message.length > 0
      ? message
      : 'Module execution failed',
    durationMs: Math.max(0, Number.isFinite(durationMs) ? Math.round(durationMs) : 0),
    statusCode: extras.statusCode || STANDARD_ERROR_STATUS,
    ...extras,
  };
}

// Best-effort coercion of legacy module returns to the standard envelope.
// Accepts:
//   - already-shaped envelope `{ success, data, ... }`            -> normalised
//   - Netlify-style `{ statusCode, body }`                        -> unwrapped
//   - plain data object                                            -> wrapped as ok()
//   - thrown error                                                 -> wrapped as err()
export function normaliseEnvelope(raw, durationMs) {
  if (raw instanceof Error) {
    return err(raw.message || 'Module threw an error', durationMs);
  }

  if (isPlainObject(raw) && typeof raw.success === 'boolean') {
    // Some legacy handlers use `duration_ms` (snake_case); accept both.
    const candidateDuration = Number.isFinite(raw.durationMs)
      ? raw.durationMs
      : (Number.isFinite(raw.duration_ms) ? raw.duration_ms : durationMs);
    let envelopeData;
    if (raw.data !== undefined) {
      envelopeData = raw.data;
    } else {
      // Legacy handlers that spread their payload at the top level (e.g.
      // `{ success: true, lighthouseResult: ..., duration_ms: ... }`) keep
      // working: anything that isn't an envelope key is treated as data.
      // Note: we deliberately do NOT strip `statusCode` here because some
      // modules (e.g. page-source, status) store the *upstream* HTTP status
      // as a domain field; collisions are resolved by ignoring `statusCode`
      // for envelope semantics in this branch.
      const meta = new Set(['success', 'data', 'error', 'durationMs', 'duration_ms']);
      const dataView = {};
      for (const [key, value] of Object.entries(raw)) {
        if (!meta.has(key)) dataView[key] = value;
      }
      envelopeData = Object.keys(dataView).length > 0 ? dataView : null;
    }
    // HTTP statusCode is intentionally 200 even for `{success: false}`
    // envelopes returned by handlers — the *scan service request* itself
    // succeeded, the *module* logically failed. Reserved 5xx for
    // unhandled exceptions / runner timeouts (set by err()). Only honour an
    // explicit envelope-level statusCode when the handler also sets `data`
    // (i.e. uses the modern envelope shape, not the legacy spread).
    const explicitStatus = (raw.data !== undefined && raw.statusCode) ? raw.statusCode : null;
    const out = {
      success: raw.success,
      data: envelopeData,
      durationMs: Math.max(
        0,
        Number.isFinite(candidateDuration) ? Math.round(candidateDuration) : 0,
      ),
      statusCode: explicitStatus || STANDARD_OK_STATUS,
    };
    if (raw.error) out.error = String(raw.error);
    return out;
  }

  if (isPlainObject(raw) && 'statusCode' in raw && 'body' in raw) {
    let body = raw.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        body = { error: body };
      }
    }
    // If the inner body is already an envelope, recurse to unwrap so the
    // outer Express statusCode wrapping does not produce a double-nested
    // shape (`envelope.data.data...`). Preserve the outer Express
    // statusCode (e.g. modules that return 200 with `success: false`)
    // since the caller intentionally chose that HTTP status.
    if (isPlainObject(body) && typeof body.success === 'boolean') {
      const inner = normaliseEnvelope(body, durationMs);
      if (raw.statusCode) inner.statusCode = raw.statusCode;
      return inner;
    }
    const succeeded = raw.statusCode >= 200 && raw.statusCode < 400;
    if (succeeded) {
      return ok(body ?? null, durationMs, { statusCode: raw.statusCode });
    }
    const message = (isPlainObject(body) && body.error) ? body.error : 'Module execution failed';
    return err(String(message), durationMs, { statusCode: raw.statusCode });
  }

  return ok(raw ?? null, durationMs);
}

export const ENVELOPE_DEFAULT_OK_STATUS = STANDARD_OK_STATUS;
export const ENVELOPE_DEFAULT_ERR_STATUS = STANDARD_ERROR_STATUS;
