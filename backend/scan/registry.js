import { readdir } from 'fs/promises';
import { basename, dirname, extname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const EXCLUDED_FILES = new Set([
  'server.js',
  'registry.js',
  'config.js',
  'tech-stack-worker.js', // worker subprocess, not a module
  'jest.config.js',
  'jest.setup.js', // Jest env only, not a scan module
  'caa-format.js', // shared helper for dns CAA strings, not a scan module
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
        console.warn(`[registry] Skipping ${file}: no callable handler export`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[registry] Failed to load ${file}: ${message}`);
    }
  }

  console.log(`[registry] Loaded ${modules.size} scan modules: ${[...modules.keys()].sort().join(', ')}`);
  return modules;
}