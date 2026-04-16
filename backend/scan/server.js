import cors from 'cors';
import express from 'express';
import helmet from 'helmet';

import { loadModules } from './registry.js';
import { withTimeout } from './utils/timeout.js';

const PORT = parseInt(process.env.SCAN_SERVICE_PORT || '4000', 10);
const TIMEOUT_MS = parseInt(process.env.API_TIMEOUT_LIMIT || '60000', 10);
const MODULE_TIMEOUT_MS = parseInt(process.env.MODULE_TIMEOUT_MS || '30000', 10);
const EXTENDED_TIMEOUT_MS = parseInt(process.env.EXTENDED_MODULE_TIMEOUT_MS || '60000', 10);
const EXTENDED_TIMEOUT_MODULES = new Set([
  'whois', // may retry after HK rate limit (~12s)
  'screenshot', 'tech-stack', 'ports', 'trace-route', 'tls', 'cookies',
]);
const CORS_ORIGIN = process.env.API_CORS_ORIGIN || '*';
const CORS_METHODS = ['GET', 'POST', 'OPTIONS'];
const CORS_HEADERS = ['Content-Type', 'Accept'];
const GENERIC_ERROR_MESSAGE = 'Scan service request failed';

// Force middleware to use the Vercel/Node request-response handler mode.
process.env.PLATFORM = 'NODE';

let modules = new Map();

function getAvailableModules() {
  return [...modules.keys()].sort();
}

async function runModuleWithFakeReqRes(handlerFn, url, scanOptions = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;

    const finish = (payload) => {
      if (!settled) {
        settled = true;
        resolve(payload);
      }
    };

    const fakeReq = { query: { url }, body: { scanOptions } };
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

    Promise.resolve(handlerFn(fakeReq, fakeRes))
      .then((maybeResult) => {
        if (!settled) {
          // Middleware handlers normally reply via res.json().
          if (maybeResult && typeof maybeResult === 'object' && 'statusCode' in maybeResult && 'body' in maybeResult) {
            finish(maybeResult);
          } else {
            finish({ statusCode: fakeRes.statusCode, body: maybeResult ?? null });
          }
        }
      })
      .catch((error) => {
        if (!settled) {
          reject(error);
        }
      });
  });
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
    credentials: true,
  }));
  app.use(express.json());

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
    const { url } = req.query;

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'Missing required query parameter: url' });
    }

    const handlerFn = modules.get(moduleName);
    if (!handlerFn) {
      return res.status(404).json({
        error: `Unknown module: ${moduleName}`,
        available: getAvailableModules(),
      });
    }

    try {
      await handlerFn(req, res);
    } catch (error) {
      console.error('[scan-service] module execution failed', {
        moduleName,
        error: error instanceof Error ? error.message : String(error),
      });
      if (!res.headersSent) {
        res.status(500).json({ error: GENERIC_ERROR_MESSAGE });
      }
    }
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
      const startedAt = Date.now();
      const handlerFn = modules.get(name);

      if (!handlerFn) {
        results[name] = {
          success: false,
          statusCode: 500,
          data: { error: `Module ${name} not found` },
          durationMs: 0,
        };
        return;
      }

      const moduleTimeout = EXTENDED_TIMEOUT_MODULES.has(name)
        ? EXTENDED_TIMEOUT_MS
        : MODULE_TIMEOUT_MS;

      try {
        const runPromise = runModuleWithFakeReqRes(handlerFn, url, scanOptions);
        const output = await withTimeout(runPromise, moduleTimeout, name);
        const success = output.statusCode >= 200 && output.statusCode < 400;

        results[name] = {
          success,
          statusCode: output.statusCode,
          data: output.body,
          durationMs: Date.now() - startedAt,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const timedOut = message.includes('timed out');
        console.error('[scan-service] batch execution failed', {
          module: name,
          error: message,
        });
        results[name] = {
          success: false,
          statusCode: 408,
          data: {
            error: timedOut ? 'Module timed out' : GENERIC_ERROR_MESSAGE,
            ...(timedOut ? { timedOut: true } : {}),
          },
          durationMs: Date.now() - startedAt,
        };
      }
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
    console.log(`[scan-service] Running on http://localhost:${PORT}`);
    console.log(`[scan-service] ${modules.size} modules loaded`);
    console.log(`[scan-service] Timeout: ${TIMEOUT_MS}ms`);
    console.log(`[scan-service] CORS origin: ${CORS_ORIGIN}`);
  });
}

if (process.env.NODE_ENV !== 'test') {
  startServer().catch((error) => {
    console.error('[scan-service] Failed to start:', error);
    process.exit(1);
  });
}