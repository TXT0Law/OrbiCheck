import xml2js from 'xml2js';

import { http } from './_common/http.js';
import middleware from './_common/middleware.js';

const SITEMAP_TIMEOUT_MS = 5000;

async function findSitemapInRobotsTxt(url) {
  const robotsRes = await http.get(`${url}/robots.txt`, { timeout: SITEMAP_TIMEOUT_MS });
  if (robotsRes.status >= 400) return null;
  const lines = String(robotsRes.data).split('\n');
  for (const line of lines) {
    if (line.toLowerCase().startsWith('sitemap:')) {
      return line.split(/\s+/)[1]?.trim() || null;
    }
  }
  return null;
}

/**
 * Scan module: fetch `/sitemap.xml`, parse with `xml2js`, and return
 * declared URLs (with a hard limit so giant sitemaps don't blow memory).
 *
 * @param {string} url Normalised target URL.
 * @returns {Promise<{urls?: string[], total?: number, error?: string,
 *   skipped?: string}>}
 */
const sitemapHandler = async (url) => {
  const defaultSitemapUrl = `${url}/sitemap.xml`;

  try {
    let sitemapUrl = defaultSitemapUrl;
    let sitemapRes = await http.get(sitemapUrl, { timeout: SITEMAP_TIMEOUT_MS });

    if (sitemapRes.status === 404) {
      // Fall back to discovering the sitemap location from robots.txt.
      const discovered = await findSitemapInRobotsTxt(url);
      if (!discovered) {
        return { skipped: 'No sitemap found' };
      }
      sitemapUrl = discovered;
      sitemapRes = await http.get(sitemapUrl, { timeout: SITEMAP_TIMEOUT_MS });
    }

    if (sitemapRes.status >= 400) {
      return { error: `Failed to fetch sitemap (HTTP ${sitemapRes.status})` };
    }

    const parser = new xml2js.Parser();
    return await parser.parseStringPromise(sitemapRes.data);
  } catch (error) {
    if (error.code === 'ECONNABORTED') {
      return { error: `Request timed-out after ${SITEMAP_TIMEOUT_MS}ms` };
    }
    return { error: error.message };
  }
};

export const handler = middleware(sitemapHandler);
export default handler;
