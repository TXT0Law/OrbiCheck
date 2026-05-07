import * as cheerio from 'cheerio';
import urlLib from 'url';

import { http } from './_common/http.js';
import middleware from './_common/middleware.js';
import { extractHostname } from './_common/url.js';

const linkedPagesHandler = async (url) => {
  const response = await http.get(url);
  const html = response.data;
  const $ = cheerio.load(html);
  const internalLinksMap = new Map();
  const externalLinksMap = new Map();
  const targetHost = extractHostname(url).toLowerCase();

  // Get all links on the page
  $('a[href]').each((i, link) => {
    const href = $(link).attr('href');
    const absoluteUrl = urlLib.resolve(url, href);
    let absoluteHost = '';
    try {
      absoluteHost = new URL(absoluteUrl).hostname.toLowerCase();
    } catch {
      return;
    }

    // P2-7 fix: same-origin via hostname comparison instead of fragile
    // `absoluteUrl.startsWith(url)` (which mis-classifies
    // example.com.evil.com/ as internal).
    if (targetHost && absoluteHost === targetHost) {
      const count = internalLinksMap.get(absoluteUrl) || 0;
      internalLinksMap.set(absoluteUrl, count + 1);
    } else if (href.startsWith('http://') || href.startsWith('https://')) {
      const count = externalLinksMap.get(absoluteUrl) || 0;
      externalLinksMap.set(absoluteUrl, count + 1);
    }
  });

  // Sort by most occurrences, remove supplicates, and convert to array
  const internalLinks = [...internalLinksMap.entries()].sort((a, b) => b[1] - a[1]).map(entry => entry[0]);
  const externalLinks = [...externalLinksMap.entries()].sort((a, b) => b[1] - a[1]).map(entry => entry[0]);

  // If there were no links, then mark as skipped and show reasons
  if (internalLinks.length === 0 && externalLinks.length === 0) {
    return {
      statusCode: 400,
      body: {
        skipped: 'No internal or external links found. '
          + 'This may be due to the website being dynamically rendered, using a client-side framework (like React), and without SSR enabled. '
          + 'That would mean that the static HTML returned from the HTTP request doesn\'t contain any meaningful content for OrbiCheck to scan. '
          + 'You can rectify this by using a headless browser to render the page instead.',
        },
    };
  }

  return { internal: internalLinks, external: externalLinks };
};

export const handler = middleware(linkedPagesHandler);
export default handler;
