// Shared JSDoc typedefs for the scan service (TASK-P3-8).
//
// JavaScript-only modules can't enforce types at runtime, but JSDoc gives:
//   - IDE intellisense for module authors,
//   - `tsc --checkJs` opt-in (each module can enable `// @ts-check` later
//     to surface type errors during local lint),
//   - a single, documented contract that future agents can grep for.
//
// IMPORTANT: This file MUST NOT export anything except types, otherwise the
// registry's `loadModules()` will pick it up. It already filters anything
// under `_common/`, so we are safe.

/**
 * Standard scan module envelope. Every handler.runDirect() resolves to this
 * shape (see `_common/middleware.js`).
 *
 * @typedef {object} ScanModuleEnvelope
 * @property {boolean} success     `true` when the module ran without errors.
 * @property {*}       data        Module-specific payload (or `null`).
 * @property {string=} error       Operator-readable error message when
 *                                  `success === false`.
 * @property {number}  durationMs  Wall-clock execution duration in ms.
 * @property {number=} statusCode  HTTP status code that the express
 *                                  handler version would emit.
 * @property {boolean=} timedOut   Set when the runner aborted the module
 *                                  via timeout (P0-6 / P2-2).
 */

/**
 * Per-request context propagated by `server.js` middleware to every handler.
 *
 * @typedef {object} ScanRequestContext
 * @property {string=} scanId       UUID provided via `X-Scan-Id` header or
 *                                   minted by the server (P1-3).
 * @property {string=} traceId      Distributed-trace correlation id.
 * @property {object=} logger       Pino-compatible child logger bound to
 *                                   `{ scanId, module }`.
 * @property {AbortSignal=} signal  Cancellation signal driven by the runner
 *                                   timeout.
 */

/**
 * Inputs every wrapped handler receives (after `_common/middleware.js`).
 *
 * @typedef {object} ScanRequestLike
 * @property {object=} query
 * @property {object=} body
 * @property {object=} headers
 * @property {ScanRequestContext=} context
 */

/**
 * Inner handler signature: takes the normalised URL plus a minimal
 * request-like object and returns either:
 *   - a plain data object,
 *   - an error-shape `{ error: string }`,
 *   - a Netlify-legacy `{ statusCode, body }`,
 *   - or already a `ScanModuleEnvelope`.
 *
 * `_common/result.js#normaliseEnvelope` coerces all of the above to
 * `ScanModuleEnvelope`.
 *
 * @callback ScanInnerHandler
 * @param {string} url               Always validated + normalised by middleware.
 * @param {ScanRequestLike} request  Minimal req-like object.
 * @returns {Promise<*>}             Anything `normaliseEnvelope` can accept.
 */

/**
 * Public handler exported from each module after wrapping with
 * `_common/middleware.js`. Both Express-style invocation and the
 * `runDirect()` shortcut used by `runner.js` are supported.
 *
 * @callback ScanModuleHandler
 * @param {ScanRequestLike} request
 * @param {object=} response
 * @returns {Promise<*>}
 */

/**
 * Module file shape: at least one of `handler` (named export) or `default`
 * must be a `ScanModuleHandler` for `registry.js` to register the module.
 *
 * @typedef {object} ScanModule
 * @property {ScanModuleHandler=} handler
 * @property {ScanModuleHandler=} default
 */

// Empty export so this file is a valid ESM module without polluting
// the registry / runtime.
export {};
