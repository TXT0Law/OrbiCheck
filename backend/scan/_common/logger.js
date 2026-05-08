// Structured logger powered by pino (P3-1).
//
// History:
//   - P1-3 introduced a small custom logger with a pino-compatible signature
//     so existing call-sites (`logger.info({...}, msg)`, `logger.child({...})`)
//     wouldn't have to change when we eventually swapped to a battle-tested
//     library.
//   - P3-1 (this file) completes that swap. We now delegate to `pino`, which
//     gives us:
//       * native structured JSON output with stable field ordering,
//       * configurable transport (pretty in dev, raw JSON in prod),
//       * `redact` support for accidental secret leakage,
//       * fast, async-safe writes via the underlying SonicBoom stream.
//   - The exported surface (`logger`, `createChildLogger`) is unchanged so all
//     35 scan modules keep working without edits.
//
// Test note:
//   Tests do not assert on log line shape; they only assert that bound
//   methods are invoked (`runner.test.js`, `ports.test.js`). pino satisfies
//   that contract, so the swap is invisible to the suite.

import { pino } from 'pino';

const ENV_LEVEL = (process.env.LOG_LEVEL || 'info').toLowerCase();
const SERVICE_NAME = process.env.LOG_SERVICE_NAME || 'scan-service';
const PRETTY = process.env.LOG_PRETTY === '1' || process.env.LOG_PRETTY === 'true';

const baseOptions = {
  level: ENV_LEVEL,
  base: { service: SERVICE_NAME },
  timestamp: pino.stdTimeFunctions.isoTime,
  // Defence-in-depth against accidental secret leakage. P2-9 handled the
  // BuiltWith API key explicitly inside features.js; this redact list catches
  // any future module that logs a request config / response by mistake.
  redact: {
    paths: [
      'apiKey',
      'api_key',
      'password',
      'authorization',
      '*.apiKey',
      '*.api_key',
      '*.password',
      '*.authorization',
      'config.headers.Authorization',
      'config.auth.password',
    ],
    censor: '[REDACTED]',
  },
};

// Wrap pino with a thin facade so the exported method signature stays
// identical across the codebase. pino's own API already matches what we
// expose, but the `child()` chain returns a pino logger which doesn't expose
// our own `createChildLogger` helper. Keeping a tiny adapter avoids surprises.
function buildAdapter(pinoLogger) {
  return {
    debug: (...args) => pinoLogger.debug(...args),
    info: (...args) => pinoLogger.info(...args),
    warn: (...args) => pinoLogger.warn(...args),
    error: (...args) => pinoLogger.error(...args),
    fatal: (...args) => pinoLogger.fatal(...args),
    child: (extra = {}) => buildAdapter(pinoLogger.child(extra)),
    // Expose the underlying pino instance for callers that need the full
    // pino API (e.g. metrics or transports). Marked `_pino` to signal it is
    // intentionally non-public.
    _pino: pinoLogger,
  };
}

// Choose transport: pretty when developer asked for it (rare in CI/Docker),
// raw JSON otherwise so the Docker stack / structured backend consumers can
// parse line-by-line.
const pinoInstance = PRETTY
  ? pino({
    ...baseOptions,
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'SYS:standard' },
    },
  })
  : pino(baseOptions);

export const logger = buildAdapter(pinoInstance);

export function createChildLogger(extra = {}) {
  return logger.child(extra);
}
