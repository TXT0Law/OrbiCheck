import * as cheerio from 'cheerio';
import urlLib from 'url';

import { http } from './_common/http.js';
import middleware from './_common/middleware.js';
import { isSameOrigin } from './_common/url.js';

/**
 * @internal Exported for direct unit testing of the link classification logic.
 *
 * Splits the rendered anchors of `html` into internal vs external collections,
 * counting duplicate occurrences. Internal-vs-external is decided by
 * hostname-equality (`isSameOrigin`) so that adversarial domains like
 * `example.com.evil.com` are NOT mistaken for the target site
 * (regression for P2-7 / P2-9).
 *
 * @param {string} html
 * @param {string} pageUrl
 * @returns {{ internal: string[], external: string[] }}
 */
export function classifyLinks(html, pageUrl) {
  const $ = cheerio.load(html);
  const internalLinksMap = new Map();
  const externalLinksMap = new Map();

  $('a[href]').each((_index, link) => {
    const href = $(link).attr('href');
    if (!href) return;

    const absoluteUrl = urlLib.resolve(pageUrl, href);
    try {
      // Validate parseability up-front; isSameOrigin tolerates failure but
      // we want to skip outright invalid hrefs cleanly.
      new URL(absoluteUrl);
    } catch {
      return;
    }

    if (isSameOrigin(pageUrl, absoluteUrl)) {
      const count = internalLinksMap.get(absoluteUrl) || 0;
      internalLinksMap.set(absoluteUrl, count + 1);
    } else if (href.startsWith('http://') || href.startsWith('https://')) {
      const count = externalLinksMap.get(absoluteUrl) || 0;
      externalLinksMap.set(absoluteUrl, count + 1);
    }
  });

  const internal = [...internalLinksMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map((entry) => entry[0]);
  const external = [...externalLinksMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map((entry) => entry[0]);

  return { internal, external };
}

const linkedPagesHandler = async (url) => {
  const response = await http.get(url);
  const html = response.data;
  const { internal, external } = classifyLinks(html, url);

  if (internal.length === 0 && external.length === 0) {
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

  return { internal, external };
};

export const handler = middleware(linkedPagesHandler);
export default handler;
