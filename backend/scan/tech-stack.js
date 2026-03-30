import { fork } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import middleware from './_common/middleware.js';
import { detectTechFromHeaders } from './_common/tech-stack-fallback.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKER_PATH = join(__dirname, 'tech-stack-worker.js');

/** Align with server batch EXTENDED_MODULE_TIMEOUT_MS (default 60s). */
const PARENT_TIMEOUT_MS = Math.min(
  Math.max(
    parseInt(process.env.EXTENDED_MODULE_TIMEOUT_MS || '60000', 10),
    15000,
  ),
  120000,
);
const WORKER_BUDGET_MS = Math.max(8000, PARENT_TIMEOUT_MS - 5000);
const FALLBACK_BUDGET_MS = Math.min(
  12000,
  Math.max(4000, PARENT_TIMEOUT_MS - WORKER_BUDGET_MS - 2000),
);

/**
 * Run Wappalyzer in an isolated child process to prevent crashes
 * from affecting the main scan service. Falls back to HTTP header hints
 * when Wappalyzer returns nothing or errors.
 */
const techStackHandler = async (url) => {
  const result = await new Promise((resolve) => {
    const child = fork(WORKER_PATH, [url], {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      env: {
        ...process.env,
        WAPPALYZER_WORKER_TIMEOUT_MS: String(WORKER_BUDGET_MS),
      },
    });

    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill('SIGTERM');
        resolve({
          technologies: [],
          error: `Tech-stack detection timed out after ${PARENT_TIMEOUT_MS}ms`,
        });
      }
    }, PARENT_TIMEOUT_MS);

    const finish = (data) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        child.kill('SIGTERM');
        resolve(data);
      }
    };

    child.on('message', (msg) => {
      if (msg && typeof msg === 'object') {
        finish({
          technologies: msg.technologies || [],
          error: msg.error,
        });
      }
    });

    child.on('exit', (code) => {
      if (!settled) {
        finish({
          technologies: [],
          error: code === 124
            ? `Worker timed out`
            : code !== 0
              ? `Worker exited with code ${code}`
              : undefined,
        });
      }
    });

    child.on('error', (err) => {
      finish({
        technologies: [],
        error: err?.message || String(err),
      });
    });
  });

  const technologies = result.technologies || [];
  const error = result.error;

  if (technologies.length === 0) {
    try {
      const fb = await detectTechFromHeaders(url, { timeoutMs: FALLBACK_BUDGET_MS });
      if (fb.technologies?.length) {
        return {
          technologies: fb.technologies,
          error:
            error ||
            'Wappalyzer returned no technologies; inferred from HTTP response headers (lower confidence).',
          headerFallback: true,
        };
      }
    } catch {
      /* keep worker/timeout result */
    }
  }

  return {
    technologies,
    ...(error ? { error } : {}),
  };
};

export const handler = middleware(techStackHandler);
export default handler;
