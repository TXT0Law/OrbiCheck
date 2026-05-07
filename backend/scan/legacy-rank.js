import axios from 'axios';
import csv from 'csv-parser';
import fs from 'fs';
import os from 'os';
import path from 'path';
import unzipper from 'unzipper';

import middleware from './_common/middleware.js';

// Cisco Umbrella's free top-1m mirror (kept stable since 2018):
const FILE_URL = 'https://s3-us-west-1.amazonaws.com/umbrella-static/top-1m.csv.zip';

// The zip ships a single file literally named `top-1m.csv`. We extract into
// the OS temp dir under that name to avoid breaking unzipper's content layout
// (the previous custom name caused "ENOENT: no such file" right after a
// successful extract because the file landed under its zip-internal name).
const EXTRACTED_FILE_NAME = 'top-1m.csv';

const getTempDir = () => os.tmpdir();
const getTempFilePath = () => path.join(getTempDir(), EXTRACTED_FILE_NAME);

// Module-level state — used to deduplicate concurrent downloads + parses.
// Both fields are reset on download/parse failure so the next request retries.
let downloadPromise = null;
let parsePromise = null;
let cachedRanks = null;

const ensureCsvDownloaded = () => {
  if (downloadPromise) return downloadPromise;

  downloadPromise = (async () => {
    const tempFilePath = getTempFilePath();
    if (fs.existsSync(tempFilePath)) {
      return tempFilePath;
    }
    const response = await axios({
      method: 'GET',
      url: FILE_URL,
      responseType: 'stream',
      // Explicit timeout: the Umbrella zip is ~10 MB; set a generous ceiling
      // so the streaming download cannot hang the worker indefinitely.
      timeout: parseInt(process.env.LEGACY_RANK_DOWNLOAD_TIMEOUT_MS || '120000', 10),
    });
    await new Promise((resolve, reject) => {
      response.data
        .pipe(unzipper.Extract({ path: getTempDir() }))
        .on('close', resolve)
        .on('error', reject);
    });
    if (!fs.existsSync(tempFilePath)) {
      throw new Error(
        `Umbrella archive extracted but expected file is missing: ${tempFilePath}`,
      );
    }
    return tempFilePath;
  })().catch((error) => {
    downloadPromise = null;
    throw error;
  });

  return downloadPromise;
};

const ensureRanksParsed = () => {
  if (cachedRanks) return Promise.resolve(cachedRanks);
  if (parsePromise) return parsePromise;

  parsePromise = (async () => {
    const tempFilePath = await ensureCsvDownloaded();
    const ranks = await new Promise((resolve, reject) => {
      const map = new Map();
      const source = fs.createReadStream(tempFilePath);
      const parser = csv({ headers: ['rank', 'domain'] });
      // Errors must be observed on BOTH ends of the pipe — Node does not
      // forward source errors through `.pipe()`, and an unhandled "error"
      // event on the read stream would otherwise crash the process.
      source.on('error', reject);
      parser.on('error', reject);
      parser.on('data', (row) => {
        if (row && row.domain) {
          map.set(row.domain, row.rank);
        }
      });
      parser.on('end', () => resolve(map));
      source.pipe(parser);
    });
    cachedRanks = ranks;
    return ranks;
  })().catch((error) => {
    parsePromise = null;
    throw error;
  });

  return parsePromise;
};

export const __resetLegacyRankCacheForTests = () => {
  downloadPromise = null;
  parsePromise = null;
  cachedRanks = null;
};

const rankHandler = async (url) => {
  let domain;
  try {
    domain = new URL(url).hostname;
  } catch (_e) {
    throw new Error('Invalid URL');
  }

  const ranks = await ensureRanksParsed();
  const rank = ranks.get(domain);
  if (rank !== undefined) {
    return { domain, rank, isFound: true };
  }
  return {
    skipped: `Skipping, as ${domain} is not present in the Umbrella top 1M list.`,
    domain,
    isFound: false,
  };
};

export const handler = middleware(rankHandler);
export default handler;
