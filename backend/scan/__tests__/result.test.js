/**
 * Direct unit tests for `_common/result.js`.
 *
 * The core envelope contract must stay backwards-compatible with five
 * historical handler return shapes during the envelope migration.
 * Every branch of `normaliseEnvelope()` is covered here so future agents can
 * change the helper without having to spelunk through 35 module tests to
 * discover what shape they relied on.
 */

import { describe, it, expect } from '@jest/globals';

import {
  ENVELOPE_DEFAULT_ERR_STATUS,
  ENVELOPE_DEFAULT_OK_STATUS,
  err,
  normaliseEnvelope,
  ok,
} from '../_common/result.js';

describe('_common/result.js — ok()', () => {
  it('produces a standard success envelope', () => {
    const envelope = ok({ foo: 'bar' }, 42);
    expect(envelope).toEqual({
      success: true,
      data: { foo: 'bar' },
      durationMs: 42,
      statusCode: ENVELOPE_DEFAULT_OK_STATUS,
    });
  });

  it('coerces missing data to null and clamps duration to 0', () => {
    const envelope = ok(undefined, undefined);
    expect(envelope.data).toBeNull();
    expect(envelope.durationMs).toBe(0);
  });

  it('rounds non-integer durations and treats negatives as 0', () => {
    expect(ok(null, 12.7).durationMs).toBe(13);
    expect(ok(null, -50).durationMs).toBe(0);
  });

  it('accepts caller-provided extras (e.g. statusCode)', () => {
    const envelope = ok({ x: 1 }, 5, { statusCode: 201 });
    expect(envelope.statusCode).toBe(201);
  });
});

describe('_common/result.js — err()', () => {
  it('produces a standard failure envelope', () => {
    const envelope = err('boom', 17);
    expect(envelope).toEqual({
      success: false,
      data: null,
      error: 'boom',
      durationMs: 17,
      statusCode: ENVELOPE_DEFAULT_ERR_STATUS,
    });
  });

  it('falls back to a generic message when input is empty', () => {
    expect(err('', 0).error).toBe('Module execution failed');
    expect(err(null, 0).error).toBe('Module execution failed');
    expect(err(undefined, 0).error).toBe('Module execution failed');
  });

  it('honours caller-supplied statusCode and timedOut flag', () => {
    const envelope = err('timed out', 30000, { statusCode: 408, timedOut: true });
    expect(envelope.statusCode).toBe(408);
    expect(envelope.timedOut).toBe(true);
  });
});

describe('_common/result.js — normaliseEnvelope()', () => {
  it('wraps a plain success object as ok()', () => {
    const envelope = normaliseEnvelope({ result: 'ok' }, 5);
    expect(envelope).toMatchObject({
      success: true,
      data: { result: 'ok' },
      durationMs: 5,
      statusCode: ENVELOPE_DEFAULT_OK_STATUS,
    });
  });

  it('wraps a thrown Error as an err() envelope', () => {
    const envelope = normaliseEnvelope(new Error('exploded'), 10);
    expect(envelope).toMatchObject({
      success: false,
      error: 'exploded',
      durationMs: 10,
      statusCode: ENVELOPE_DEFAULT_ERR_STATUS,
    });
  });

  it('preserves an already-shaped envelope with explicit `data`', () => {
    const raw = {
      success: true,
      data: { ranks: [1, 2] },
      durationMs: 100,
    };
    expect(normaliseEnvelope(raw, 0)).toMatchObject({
      success: true,
      data: { ranks: [1, 2] },
      durationMs: 100,
      statusCode: ENVELOPE_DEFAULT_OK_STATUS,
    });
  });

  it('accepts the snake_case `duration_ms` from legacy handlers', () => {
    const raw = { success: true, data: { x: 1 }, duration_ms: 250 };
    expect(normaliseEnvelope(raw, 0).durationMs).toBe(250);
  });

  it('extracts spread fields into `data` when handler omits the data key (legacy spread)', () => {
    // E.g. quality.js: `{ success: true, lighthouseResult: ..., duration_ms: 5 }`.
    const raw = {
      success: true,
      lighthouseResult: { score: 0.9 },
      duration_ms: 5,
    };
    const envelope = normaliseEnvelope(raw, 0);
    expect(envelope.data).toEqual({ lighthouseResult: { score: 0.9 } });
    expect(envelope.statusCode).toBe(ENVELOPE_DEFAULT_OK_STATUS);
    expect(envelope.durationMs).toBe(5);
  });

  it('keeps a domain-level `statusCode` field inside `data` (page-source regression)', () => {
    // page-source.js stores upstream HTTP status under `statusCode`. That
    // must NOT shadow the envelope-level statusCode; instead it stays in
    // `data` and the envelope's own statusCode defaults to 200.
    const raw = {
      success: true,
      html: '<html></html>',
      statusCode: 404,
      contentType: 'text/html',
    };
    const envelope = normaliseEnvelope(raw, 0);
    expect(envelope.data.statusCode).toBe(404);
    expect(envelope.statusCode).toBe(ENVELOPE_DEFAULT_OK_STATUS);
  });

  it('routes `{success: false}` envelopes to HTTP 200 (module-level failure ≠ HTTP failure)', () => {
    // This is intentional — failures from the module are reported via the
    // envelope, not via HTTP status. Reserving 5xx for unhandled exceptions
    // means scan_client.raise_for_status() will not abort whole batches on
    // partial module failures.
    const raw = { success: false, data: {}, error: 'No certificate' };
    const envelope = normaliseEnvelope(raw, 0);
    expect(envelope.success).toBe(false);
    expect(envelope.error).toBe('No certificate');
    expect(envelope.statusCode).toBe(ENVELOPE_DEFAULT_OK_STATUS);
  });

  it('honours an explicit envelope-level statusCode when handler also sets `data`', () => {
    const raw = {
      success: false,
      data: {},
      error: 'Bad gateway',
      statusCode: 502,
    };
    expect(normaliseEnvelope(raw, 0).statusCode).toBe(502);
  });

  it('unwraps Netlify-style { statusCode, body } and JSON-parses string bodies', () => {
    const raw = {
      statusCode: 500,
      body: JSON.stringify({ error: 'connection reset' }),
    };
    const envelope = normaliseEnvelope(raw, 7);
    expect(envelope).toMatchObject({
      success: false,
      error: 'connection reset',
      statusCode: 500,
    });
  });

  it('Netlify-style success body becomes data', () => {
    const raw = {
      statusCode: 200,
      body: { hasWaf: true, waf: 'Cloudflare' },
    };
    const envelope = normaliseEnvelope(raw, 3);
    expect(envelope).toMatchObject({
      success: true,
      data: { hasWaf: true, waf: 'Cloudflare' },
      statusCode: 200,
    });
  });

  it('recursively unwraps a Netlify-style wrapper around an envelope (no double nesting)', () => {
    // Mock handlers that call `res.status(200).json({ success: true, data: {...} })`
    // arrive at the runner as `{ statusCode: 200, body: <envelope> }`. We must
    // NOT end up with envelope.data.data — recurse to flatten.
    const raw = {
      statusCode: 200,
      body: { success: true, data: { nested: 'value' }, durationMs: 9 },
    };
    const envelope = normaliseEnvelope(raw, 0);
    expect(envelope.data).toEqual({ nested: 'value' });
    expect(envelope.success).toBe(true);
    expect(envelope.statusCode).toBe(200);
  });

  it('recursive unwrap preserves outer Express statusCode', () => {
    // Module returned `{ success: false }` with HTTP 200 — we keep the 200.
    const raw = {
      statusCode: 200,
      body: { success: false, data: null, error: 'Some failure' },
    };
    const envelope = normaliseEnvelope(raw, 0);
    expect(envelope.statusCode).toBe(200);
    expect(envelope.success).toBe(false);
    expect(envelope.error).toBe('Some failure');
  });

  it('coerces non-JSON string bodies into `{error: <body>}`', () => {
    const raw = { statusCode: 500, body: 'plain text error' };
    const envelope = normaliseEnvelope(raw, 0);
    expect(envelope.success).toBe(false);
    expect(envelope.error).toBe('plain text error');
  });
});
