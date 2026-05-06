/**
 * Regression guard for TASK-P0-7: prevents future drift between
 *  - the runtime module registry (`registry.js`)
 *  - the cross-service module list (`shared/constants/modules.ts`).
 *
 * If a new module file is added under `backend/scan/`, the corresponding
 * id MUST also be registered in `shared/constants/modules.ts` so the
 * frontend type system (`ScanModuleName`) and the backend transformer
 * stay aligned with what scan-service can actually run.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { loadModules } from '../registry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readSharedScanModules() {
  const sharedPath = path.resolve(__dirname, '../../../shared/constants/modules.ts');
  const source = fs.readFileSync(sharedPath, 'utf8');
  const match = source.match(/export\s+const\s+SCAN_MODULES\s*=\s*\[([\s\S]*?)\]\s*as\s*const/);
  if (!match) {
    throw new Error('Could not locate SCAN_MODULES export in shared/constants/modules.ts');
  }
  return match[1]
    .split(',')
    .map((segment) => segment.replace(/\/\/.*$/g, '').trim())
    .filter(Boolean)
    .map((segment) => segment.replace(/^["']|["']$/g, ''));
}

function readSharedModuleToFrontendKey() {
  const sharedPath = path.resolve(__dirname, '../../../shared/constants/modules.ts');
  const source = fs.readFileSync(sharedPath, 'utf8');
  const match = source.match(/export\s+const\s+MODULE_TO_FRONTEND_KEY[^{]*\{([\s\S]*?)\};/);
  if (!match) {
    throw new Error('Could not locate MODULE_TO_FRONTEND_KEY export in shared/constants/modules.ts');
  }
  const keys = [];
  const body = match[1];
  // Object literal keys may be either quoted (for hyphenated names like
  // "http-security") or bare identifiers (for plain names like ssl). We need
  // to capture both forms.
  const entryRegex = /(?:^|[\s,{])(?:["']([\w-]+)["']|([A-Za-z_][\w]*))\s*:/gm;
  let m = entryRegex.exec(body);
  while (m) {
    keys.push(m[1] || m[2]);
    m = entryRegex.exec(body);
  }
  return keys;
}

describe('registry / shared module list sync', () => {
  it('every loaded module is also declared in shared/constants/modules.ts SCAN_MODULES', async () => {
    const registry = await loadModules();
    const registryNames = [...registry.keys()].sort();
    const sharedNames = readSharedScanModules().sort();

    expect(registryNames.length).toBeGreaterThan(0);
    expect(registryNames).toEqual(sharedNames);
  });

  it('every loaded module has a MODULE_TO_FRONTEND_KEY mapping', async () => {
    const registry = await loadModules();
    const registryNames = [...registry.keys()];
    const mappingKeys = new Set(readSharedModuleToFrontendKey());

    const missing = registryNames.filter((name) => !mappingKeys.has(name));
    expect(missing).toEqual([]);
  });
});
