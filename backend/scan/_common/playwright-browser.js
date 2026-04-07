import { existsSync } from 'node:fs';

import { chromium } from 'playwright';

const CHROMIUM_CANDIDATES = [
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
];

export async function launchChromium(options = {}) {
  const executablePath =
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
    CHROMIUM_CANDIDATES.find((candidate) => existsSync(candidate));

  return chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    ...options,
  });
}
