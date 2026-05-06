import axios from 'axios';
import csv from 'csv-parser';
import fs from 'fs';
import os from 'os';
import path from 'path';
import unzipper from 'unzipper';

import middleware from './_common/middleware.js';

// Cisco Umbrella's free top-1m mirror (kept stable since 2018):
const FILE_URL = 'https://s3-us-west-1.amazonaws.com/umbrella-static/top-1m.csv.zip';
const TEMP_FILE_NAME = 'orbicheck-umbrella-top-1m.csv';

const getTempFilePath = () => path.join(os.tmpdir(), TEMP_FILE_NAME);
const getTempDir = () => os.tmpdir();

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
    });
    await new Promise((resolve, reject) => {
      response.data
        .pipe(unzipper.Extract({ path: getTempDir() }))
        .on('close', resolve)
        .on('error', reject);
    });
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
      const stream = fs.createReadStream(tempFilePath)
        .pipe(csv({ headers: ['rank', 'domain'] }))
        .on('data', (row) => {
          if (row && row.domain) {
            map.set(row.domain, row.rank);
          }
        })
        .on('end', () => resolve(map))
        .on('error', reject);
      // Defensive: csv-parser doesn't always propagate stream errors otherwise.
      stream.on('error', reject);
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
