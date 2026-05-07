// Lightweight structured logger. Pino-compatible interface (`info`/`warn`/
// `error`/`child`) so we can swap to pino later without touching call-sites.
// Outputs single-line JSON to stdout/stderr to remain Docker-friendly.

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const ENV_LEVEL = (process.env.LOG_LEVEL || 'info').toLowerCase();
const ACTIVE_LEVEL = LEVELS[ENV_LEVEL] || LEVELS.info;
const SERVICE_NAME = process.env.LOG_SERVICE_NAME || 'scan-service';

function safeStringify(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ unserialisable: true, type: typeof value });
  }
}

function emit(level, bindings, msgOrPayload, maybeMsg) {
  if (LEVELS[level] < ACTIVE_LEVEL) return;
  let payload = {};
  let msg = '';
  if (typeof msgOrPayload === 'string') {
    msg = msgOrPayload;
  } else if (msgOrPayload && typeof msgOrPayload === 'object') {
    payload = msgOrPayload;
    if (typeof maybeMsg === 'string') msg = maybeMsg;
  }
  const record = {
    level,
    time: new Date().toISOString(),
    service: SERVICE_NAME,
    ...bindings,
    ...payload,
    ...(msg ? { msg } : {}),
  };
  const line = safeStringify(record);
  if (level === 'error') {
    process.stderr.write(`${line}\n`);
  } else {
    process.stdout.write(`${line}\n`);
  }
}

function buildLogger(bindings = {}) {
  const baseBindings = { ...bindings };
  return {
    debug: (a, b) => emit('debug', baseBindings, a, b),
    info: (a, b) => emit('info', baseBindings, a, b),
    warn: (a, b) => emit('warn', baseBindings, a, b),
    error: (a, b) => emit('error', baseBindings, a, b),
    child: (extra = {}) => buildLogger({ ...baseBindings, ...extra }),
  };
}

export const logger = buildLogger();

export function createChildLogger(extra = {}) {
  return logger.child(extra);
}
