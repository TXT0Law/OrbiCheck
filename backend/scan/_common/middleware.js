// Common middleware for the OrbiCheck scan service.
// Responsibilities (kept minimal so each module can stay focused on its OSINT
// logic):
//   1. Maintenance gate (`VITE_DISABLE_EVERYTHING`).
//   2. Request URL extraction + normalisation.
//   3. Per-handler timeout.
//   4. Wrap whatever the inner handler returns into the standard envelope
//      `{ success, data, error?, durationMs, statusCode }` so callers (and the
//      Python transformer layer) can rely on a single contract.
//
// Each wrapped handler exposes `runDirect(rawUrl, request, options?)` which the
// scan runner can call without fabricating Express req/res objects.

import { logger } from './logger.js';
import {
  createAbortError,
  createLinkedAbortController,
  getRequestSignal,
  isAbortError,
} from './abort.js';
import { err, normaliseEnvelope } from './result.js';
import { normalizeUrl } from './url.js';
import {
  isRuntimeUrlSafetyEnabled,
  resolvePublicUrl,
  UnsafeUrlError,
} from './url-safety.js';

const TIMEOUT = process.env.API_TIMEOUT_LIMIT
  ? parseInt(process.env.API_TIMEOUT_LIMIT, 10)
  : 60000;

const DISABLE_EVERYTHING = !!process.env.VITE_DISABLE_EVERYTHING;

const TIMEOUT_ERROR_MESSAGE = 'You can re-trigger this request, by clicking "Retry"\n'
  + 'If you\'re running your own instance of OrbiCheck, then you can resolve '
  + 'this issue, by increasing the timeout limit in the `API_TIMEOUT_LIMIT` '
  + 'environmental variable to a higher value (in milliseconds).\n\n'
  + `The public instance currently has a lower timeout of ${TIMEOUT}ms in order `
  + 'to keep running costs affordable, so that OrbiCheck can remain freely '
  + 'available for everyone.';

const DISABLED_ERROR_MESSAGE = 'Error - OrbiCheck Temporarily Disabled.\n\n'
  + 'We\'re sorry, but due to the increased cost of running OrbiCheck '
  + 'we\'ve had to temporarily disable the public instance. We\'re actively '
  + 'looking for affordable ways to keep OrbiCheck running, while free to use '
  + 'for everybody.\n'
  + 'In the meantime, since we\'ve made our code free and open source, '
  + 'you can get OrbiCheck running on your own system, by following the '
  + 'instructions in our GitHub repo.';

const GENERIC_ERROR_MESSAGE = 'Request failed while processing this scan module.';

function resolveTimeoutMs(options = {}) {
  return Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
    ? options.timeoutMs
    : TIMEOUT;
}

function createTimeoutPromise(timeoutMs, parentSignal) {
  const { signal, cleanup, abort } = createLinkedAbortController(parentSignal);
  let cleanupTimeout = cleanup;
  const promise = new Promise((_resolve, reject) => {
    const onAbort = () => reject(signal.reason || createAbortError());
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) {
      onAbort();
    }
    const timer = setTimeout(() => {
      const error = new Error(`Request timed-out after ${timeoutMs} ms`);
      error.code = 'MIDDLEWARE_TIMEOUT';
      abort(error);
    }, timeoutMs);
    cleanupTimeout = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      cleanup();
    };
  });
  return {
    signal,
    promise,
    cancel: () => cleanupTimeout(),
  };
}

function isTimeoutError(error) {
  if (!error) return false;
  if (error.code === 'MIDDLEWARE_TIMEOUT') return true;
  const message = (error.message || String(error)).toLowerCase();
  return message.includes('timed-out') || message.includes('timed out');
}

const commonMiddleware = (handler) => {
  // Direct invocation entry-point used by the scan runner.
  // Returns a fully-formed envelope; never throws.
  const runDirect = async (rawUrl, request = {}, _options = {}) => {
    const startedAt = Date.now();
    const log = (request && request.context && request.context.logger) || logger;

    if (DISABLE_EVERYTHING) {
      return err(DISABLED_ERROR_MESSAGE, Date.now() - startedAt, { statusCode: 503 });
    }

    if (!rawUrl) {
      return err('No URL specified', Date.now() - startedAt, { statusCode: 400 });
    }

    const normalisedUrl = normalizeUrl(rawUrl);
    if (!normalisedUrl) {
      return err('No URL specified', Date.now() - startedAt, { statusCode: 400 });
    }
    if (isRuntimeUrlSafetyEnabled()) {
      try {
        const resolvedTarget = await resolvePublicUrl(normalisedUrl, {
          allowPrivate: false,
        });
        request.context = {
          ...(request.context || {}),
          resolvedTarget,
        };
      } catch (error) {
        if (error instanceof UnsafeUrlError) {
          log.warn(
            { reason: error.message },
            'module middleware blocked unsafe target',
          );
          return err(error.message, Date.now() - startedAt, { statusCode: 400 });
        }
        throw error;
      }
    }

    const timeoutMs = resolveTimeoutMs(_options);
    const parentSignal = getRequestSignal(request, _options);
    const timeout = createTimeoutPromise(timeoutMs, parentSignal);
    request.context = {
      ...(request.context || {}),
      signal: timeout.signal,
    };
    try {
      const handlerResult = await Promise.race([
        Promise.resolve().then(() => handler(normalisedUrl, request)),
        timeout.promise,
      ]);
      return normaliseEnvelope(handlerResult, Date.now() - startedAt);
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      if (isTimeoutError(error)) {
        log.warn({ moduleTimeoutMs: timeoutMs }, 'module middleware request timed out');
        return err(TIMEOUT_ERROR_MESSAGE, durationMs, { statusCode: 408, timedOut: true });
      }
      if (isAbortError(error)) {
        log.warn({ moduleTimeoutMs: timeoutMs }, 'module middleware work aborted');
        return err('Scan work aborted', durationMs, { statusCode: 408, timedOut: true });
      }
      // Hide internal error details from external callers; log full message
      // for operators.
      log.warn({ error: (error && error.message) ? error.message : String(error) }, 'module handler threw');
      return err(GENERIC_ERROR_MESSAGE, durationMs);
    } finally {
      timeout.cancel();
    }
  };

  // Express-style adapter: kept so existing routes / tests can call
  // `handler(req, res)` unchanged.
  const expressHandler = async (request, response) => {
    const queryParams = request && request.query ? request.query : {};
    const envelope = await runDirect(queryParams.url, request);
    if (response && typeof response.status === 'function' && typeof response.json === 'function') {
      const httpStatus = envelope.statusCode || (envelope.success ? 200 : 500);
      return response.status(httpStatus).json(envelope);
    }
    return envelope;
  };

  expressHandler.runDirect = runDirect;
  return expressHandler;
};

export default commonMiddleware;
