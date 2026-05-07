import { readdir } from 'fs/promises';
import { basename, dirname, extname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

import { logger } from './_common/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const EXCLUDED_FILES = new Set([
  'server.js',
  'registry.js',
  'runner.js', // shared orchestration helper, not a scan module
  'config.js',
  'tech-stack-worker.js', // worker subprocess, not a module
  'jest.config.js',
  'jest.setup.js', // Jest env only, not a scan module
  'caa-format.js', // shared helper for dns CAA strings, not a scan module
  // trace-route is disabled (P1-9): the .js file is kept for the future
  // execFile-based reimplementation but must not be auto-registered.
  'trace-route.js',
]);

export async function loadModules() {
  const modules = new Map();
  const files = await readdir(__dirname);

  const jsFiles = files
    .filter((file) => extname(file) === '.js')
    .filter((file) => !file.startsWith('_'))
    .filter((file) => !file.startsWith('._'))
    .filter((file) => !EXCLUDED_FILES.has(file));

  for (const file of jsFiles) {
    const moduleName = basename(file, '.js');
    const modulePath = pathToFileURL(join(__dirname, file)).href;

    try {
      const mod = await import(modulePath);
      const handlerFn = mod.handler || mod.default;

      if (typeof handlerFn === 'function') {
        modules.set(moduleName, handlerFn);
      } else {
        logger.warn({ file }, 'registry: skipping module — no callable handler export');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ file, error: message }, 'registry: failed to load module');
    }
  }

  logger.info(
    { count: modules.size, modules: [...modules.keys()].sort() },
    'registry: scan modules loaded',
  );
  return modules;
}
