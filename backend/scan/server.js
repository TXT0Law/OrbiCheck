import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { randomUUID } from 'crypto';

import { logger } from './_common/logger.js';
import { loadModules } from './registry.js';
import { runModule } from './runner.js';

const PORT = parseInt(process.env.SCAN_SERVICE_PORT || '4000', 10);
const TIMEOUT_MS = parseInt(process.env.API_TIMEOUT_LIMIT || '60000', 10);
const MODULE_TIMEOUT_MS = parseInt(process.env.MODULE_TIMEOUT_MS || '30000', 10);
const EXTENDED_TIMEOUT_MS = parseInt(process.env.EXTENDED_MODULE_TIMEOUT_MS || '60000', 10);
const EXTENDED_TIMEOUT_MODULES = new Set([
  'whois', // may retry after HK rate limit (~12s)
  'screenshot', 'tech-stack', 'ports', 'tls', 'cookies',
]);
const CORS_ORIGIN = process.env.API_CORS_ORIGIN || '*';
const CORS_METHODS = ['GET', 'POST', 'OPTIONS'];
const CORS_HEADERS = ['Content-Type', 'Accept', 'X-Scan-Id', 'X-Trace-Id'];
const SCAN_ID_HEADER = 'x-scan-id';
const TRACE_ID_HEADER = 'x-trace-id';

let modules = new Map();

function getAvailableModules() {
  return [...modules.keys()].sort();
}

function moduleTimeoutFor(name) {
  return EXTENDED_TIMEOUT_MODULES.has(name) ? EXTENDED_TIMEOUT_MS : MODULE_TIMEOUT_MS;
}

function extractRequestContext(req) {
  const headerScanId = req.get ? req.get(SCAN_ID_HEADER) : (req.headers || {})[SCAN_ID_HEADER];
  const headerTraceId = req.get ? req.get(TRACE_ID_HEADER) : (req.headers || {})[TRACE_ID_HEADER];
  const scanId = (typeof headerScanId === 'string' && headerScanId.trim()) || randomUUID();
  const traceId = (typeof headerTraceId === 'string' && headerTraceId.trim()) || scanId;
  const requestLogger = logger.child({ scanId, traceId });
  return { scanId, traceId, logger: requestLogger };
}

export function setModulesForTest(nextModules) {
  modules = nextModules;
}

export function createApp() {
  const app = express();
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }));
  app.use(cors({
    origin: CORS_ORIGIN,
    methods: CORS_METHODS,
    allowedHeaders: CORS_HEADERS,
    exposedHeaders: ['X-Scan-Id', 'X-Trace-Id'],
    credentials: true,
  }));
  app.use(express.json());

  // Trace context propagation: ensure every request has a scanId/traceId and
  // echo them back so callers (Python backend / Celery) can correlate logs.
  app.use((req, res, next) => {
    const ctx = extractRequestContext(req);
    req.context = ctx;
    res.setHeader('X-Scan-Id', ctx.scanId);
    res.setHeader('X-Trace-Id', ctx.traceId);
    next();
  });

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      modules: modules.size,
      uptime: process.uptime(),
    });
  });

  app.get('/api/scan/modules', (_req, res) => {
    res.json({
      modules: getAvailableModules(),
      count: modules.size,
    });
  });

  app.get('/api/scan/:module', async (req, res) => {
    const moduleName = req.params.module;
    const { url, ...rest } = req.query || {};

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'Missing required query parameter: url' });
    }

    const handler = modules.get(moduleName);
    if (!handler) {
      return res.status(404).json({
        error: `Unknown module: ${moduleName}`,
        available: getAvailableModules(),
      });
    }

    const envelope = await runModule({
      name: moduleName,
      handler,
      url,
      scanOptions: rest,
      timeoutMs: moduleTimeoutFor(moduleName),
      logger: req.context.logger,
      context: { scanId: req.context.scanId, traceId: req.context.traceId },
    });

    return res.status(envelope.statusCode || (envelope.success ? 200 : 500)).json(envelope);
  });

  app.post('/api/scan/batch', async (req, res) => {
    const {
      url,
      modules: requestedModules,
      scanOptions = {},
    } = req.body || {};

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'Missing required field: url' });
    }

    const moduleNames = Array.isArray(requestedModules) && requestedModules.length > 0
      ? requestedModules
      : getAvailableModules();

    const unknownModules = moduleNames.filter((name) => !modules.has(name));
    if (unknownModules.length > 0) {
      return res.status(400).json({
        error: `Unknown modules: ${unknownModules.join(', ')}`,
        available: getAvailableModules(),
      });
    }

    const results = {};
    const tasks = moduleNames.map(async (name) => {
      const handler = modules.get(name);
      const envelope = await runModule({
        name,
        handler,
        url,
        scanOptions,
        timeoutMs: moduleTimeoutFor(name),
        logger: req.context.logger,
        context: { scanId: req.context.scanId, traceId: req.context.traceId },
      });
      results[name] = {
        success: envelope.success,
        statusCode: envelope.statusCode,
        data: envelope.data,
        durationMs: envelope.durationMs,
        ...(envelope.error ? { error: envelope.error } : {}),
        ...(envelope.timedOut ? { timedOut: true } : {}),
      };
    });

    await Promise.allSettled(tasks);

    const successCount = Object.values(results).filter((item) => item.success).length;
    res.json({
      url,
      totalModules: moduleNames.length,
      successCount,
      failedCount: moduleNames.length - successCount,
      results,
    });
  });

  return app;
}

export const app = createApp();

export async function startServer() {
  modules = await loadModules();

  app.listen(PORT, () => {
    logger.info({
      port: PORT,
      modules: modules.size,
      timeoutMs: TIMEOUT_MS,
      corsOrigin: CORS_ORIGIN,
    }, 'scan-service running');
  });
}

if (process.env.NODE_ENV !== 'test') {
  startServer().catch((error) => {
    logger.error({ error: error?.message || String(error) }, 'scan-service failed to start');
    process.exit(1);
  });
}
