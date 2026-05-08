/**
 * Worker subprocess for tech-stack detection.
 * Runs Wappalyzer in isolation so crashes do not affect the main scan service.
 * Sends result via process.send({ technologies, error? }).
 *
 * Note: Anti-bot sites (e.g. bilibili.com) often block headless browsers;
 * results may be empty for such targets. The scan service uses EXTENDED_TIMEOUT_MS
 * (60s) for this module when running in batch.
 */

const WORKER_TIMEOUT_MS = parseInt(
  process.env.WAPPALYZER_WORKER_TIMEOUT_MS || '55000',
  10,
);

process.on('uncaughtException', (err) => {
  process.send?.({ technologies: [], error: err?.message || String(err) });
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  process.send?.({ technologies: [], error: err?.message || String(err) });
  process.exit(1);
});

async function runDetection(url) {
  try {
    const Wappalyzer = (await import('wappalyzer')).default;
    const wappalyzer = new Wappalyzer({});
    await wappalyzer.init();
    try {
      const headers = {};
      const storage = { local: {}, session: {} };
      const site = await wappalyzer.open(url, headers, storage);
      const results = await site.analyze();
      return results?.technologies || [];
    } finally {
      await wappalyzer.destroy();
    }
  } catch (err) {
    // P2-8: forward the original cause so the parent process logger sees the
    // wappalyzer failure context rather than a flattened message.
    throw new Error(err?.message || String(err), { cause: err });
  }
}

const url = process.argv[2];
if (!url) {
  process.send?.({ technologies: [], error: 'No URL provided' });
  process.exit(1);
}

const timeout = setTimeout(() => {
  process.send?.({ technologies: [], error: `Wappalyzer timed out after ${WORKER_TIMEOUT_MS}ms` });
  process.exit(124);
}, WORKER_TIMEOUT_MS);

runDetection(url)
  .then((technologies) => {
    clearTimeout(timeout);
    process.send?.({ technologies: technologies || [] });
    process.exit(0);
  })
  .catch((err) => {
    clearTimeout(timeout);
    process.send?.({ technologies: [], error: err?.message || String(err) });
    process.exit(1);
  });
