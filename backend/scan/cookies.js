import axios from 'axios';
import { chromium } from 'playwright';
import middleware from './_common/middleware.js';

const BROWSER_TIMEOUT_MS = 20000;

const getPlaywrightCookies = async (url) => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: BROWSER_TIMEOUT_MS,
    });
    return await context.cookies();
  } finally {
    await browser.close();
  }
};

const cookieHandler = async (url) => {
  let headerCookies = null;
  let clientCookies = null;

  try {
    const response = await axios.get(url, {
      withCredentials: true,
      maxRedirects: 5,
    });
    headerCookies = response.headers['set-cookie'];
  } catch (error) {
    if (error.response) {
      return { error: `Request failed with status ${error.response.status}: ${error.message}` };
    } else if (error.request) {
      return { error: `No response received: ${error.message}` };
    } else {
      return { error: `Error setting up request: ${error.message}` };
    }
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
