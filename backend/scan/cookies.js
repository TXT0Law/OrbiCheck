import { http } from './_common/http.js';
import middleware from './_common/middleware.js';
import { withBrowserContext } from './_common/playwright-browser.js';

const BROWSER_TIMEOUT_MS = 20000;

const getPlaywrightCookies = async (url) => {
  return withBrowserContext(async (context, page) => {
    await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: BROWSER_TIMEOUT_MS,
    });
    return context.cookies();
  });
};

const cookieHandler = async (url) => {
  let headerCookies = null;
  let clientCookies = null;

  try {
    const response = await http.get(url, {
      withCredentials: true,
      maxRedirects: 5,
    });
    if (response.status >= 400) {
      return { error: `Request failed with status ${response.status}: HTTP ${response.status}` };
    }
    headerCookies = response.headers['set-cookie'];
  } catch (error) {
    if (error.request) {
      return { error: `No response received: ${error.message}` };
    }
    return { error: `Error setting up request: ${error.message}` };
  }

  try {
    clientCookies = await getPlaywrightCookies(url);
  } catch (_) {
    clientCookies = null;
  }

  if (!headerCookies && (!clientCookies || clientCookies.length === 0)) {
    return { skipped: 'No cookies' };
  }

  return { headerCookies, clientCookies };
};

export const handler = middleware(cookieHandler);
export default handler;
