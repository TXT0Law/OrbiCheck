// Module runner. Owns timeout enforcement, envelope normalisation, and
// abort-signal propagation so server.js (single-module GET) and the batch
// path (POST /api/scan/batch) share a single execution contract.

import { getHostLimiter } from './_common/host-limiter.js';
import { logger as defaultLogger } from './_common/logger.js';
import { observeModuleRun } from './_common/metrics.js';
import { err, normaliseEnvelope } from './_common/result.js';

const GENERIC_ERROR_MESSAGE = 'Scan service request failed';

function isTimeoutError(error) {
  if (!error) return false;
  if (error.code === 'RUNNER_TIMEOUT' || error.code === 'MIDDLEWARE_TIMEOUT') return true;
  const message = (error.message || String(error)).toLowerCase();
  return message.includes('timed out') || message.includes('timed-out');
}

function createDeferredTimeout(ms) {
  // B-5: the host limiter (S-7) may queue this module behind other
  // requests for the same hostname; queue wait must NOT count toward the
  // module timeout. We expose `start()` so the caller can begin the timer
  // only after the limiter slot has been acquired. Until `start()` is
  // called, `timeoutPromise` stays pending forever, so a Promise.race
  // against it is effectively a no-op gate.
  const controller = new AbortController();
  let timer;
  let rejectFn;
  const timeoutPromise = new Promise((_resolve, reject) => {
    rejectFn = reject;
  });
  const start = () => {
    if (timer !== undefined) return;
    timer = setTimeout(() => {
      const error = new Error(`Module timed out after ${ms}ms`);
      error.code = 'RUNNER_TIMEOUT';
      controller.abort(error);
      rejectFn(error);
    }, ms);
  };
  const cancel = () => {
    if (timer !== undefined) clearTimeout(timer);
  };
  return { signal: controller.signal, timeoutPromise, cancel, start };
}

/**
 * Run a scan module and produce a normalised envelope.
 *
 * @param {object} options
 * @param {string} options.name           Module name (used in logs/errors).
 * @param {Function} options.handler      The scan module export (Express-style
 *                                         middleware-wrapped function or pure
 *                                         async fn). Both shapes are handled.
 * @param {string} options.url            Target URL.
 * @param {object} [options.scanOptions]  Optional batch scan options.
 * @param {number} options.timeoutMs      Hard timeout in milliseconds.
 * @param {object} [options.logger]       Bound logger (will receive scanId etc).
 * @param {object} [options.context]      Per-request context (scanId, traceId).
 * @returns {Promise<{success: boolean, statusCode: number, data: any,
 *                    error?: string, durationMs: number, timedOut?: boolean}>}
 */
export async function runModule({
  name,
  handler,
  url,
  scanOptions = {},
  timeoutMs,
  logger = defaultLogger,
  context = {},
}) {
  const startedAt = Date.now();
  const log = logger.child ? logger.child({ module: name, scanId: context.scanId }) : logger;

  if (typeof handler !== 'function') {
    return {
      ...err(`Module '${name}' has no callable handler`, 0, { statusCode: 500 }),
      durationMs: 0,
    };
  }

  // P3-2: track in-flight modules + completion counters/histograms so /metrics
  // can answer "which module is the slowest p95?" without touching call sites.
  const completeMetrics = observeModuleRun(name);
  const { signal, timeoutPromise, cancel, start: startTimeout } = createDeferredTimeout(timeoutMs);
  // Build a request-like object for the inner handler. Modules that were
  // already migrated to call `handler.runDirect()` get scanOptions/context
  // explicitly; legacy Express-style handlers see the familiar req shape.
  const fakeReq = {
    query: { url, ...scanOptions },
    body: { scanOptions },
    headers: {},
    context: { ...context, logger: log, signal },
  };

  // S-7: cap concurrent module runs against the same hostname so a 30-
  // module batch can't fan out 30 sockets at once against a CDN edge /
  // WAF. The limiter is shared across the batch so single-module GET and
  // batch entries that target the same host serialise correctly.
  const hostLimiter = getHostLimiter(url);

  let envelope;
  try {
    const result = await Promise.race([
      hostLimiter.run(() => {
        // B-5: only start the module timeout once the limiter slot is
        // acquired. Queue wait counts against the batch wall-clock but
        // not against the per-module budget — see S-7 acceptance
        // criteria in prompt_dev/middleReport.md.
        startTimeout();
        if (typeof handler.runDirect === 'function') {
          return handler.runDirect(url, fakeReq, { scanOptions, signal });
        }
        return invokeExpressHandler(handler, fakeReq);
      }),
      timeoutPromise,
    ]);
    envelope = normaliseEnvelope(result, Date.now() - startedAt);
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    if (isTimeoutError(error)) {
      log.warn({ timeoutMs }, 'module timed out');
      envelope = err('Module timed out', durationMs, { statusCode: 408, timedOut: true });
    } else {
      // Hide internal error details from external callers; log full message
      // for operators.
      log.error({ error: error?.message || String(error) }, 'module execution failed');
      envelope = err(GENERIC_ERROR_MESSAGE, durationMs);
    }
  } finally {
    cancel();
  }

  // Ensure the envelope reports a real wall-clock duration for the runner's
  // perspective (modules sometimes report 0 / unset).
  if (!Number.isFinite(envelope.durationMs) || envelope.durationMs <= 0) {
    envelope.durationMs = Date.now() - startedAt;
  }

  completeMetrics(envelope);
  return envelope;
}

function invokeExpressHandler(handler, fakeReq) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (payload) => {
      if (!settled) {
        settled = true;
        resolve(payload);
      }
    };
    const fakeRes = {
      headersSent: false,
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        this.headersSent = true;
        finish({ statusCode: this.statusCode, body });
        return this;
      },
    };

    Promise.resolve()
      .then(() => handler(fakeReq, fakeRes))
      .then((maybeReturn) => {
        if (settled) return;
        if (maybeReturn && typeof maybeReturn === 'object' && 'statusCode' in maybeReturn && 'body' in maybeReturn) {
          finish(maybeReturn);
        } else {
          finish({ statusCode: fakeRes.statusCode, body: maybeReturn ?? null });
        }
      })
      .catch((error) => {
        if (!settled) reject(error);
      });
  });
}

export default runModule;
