import axios from 'axios';

import middleware from './_common/middleware.js';

const MOZILLA_TLS_OBSERVATORY_API = 'https://tls-observatory.services.mozilla.com/api/v1';
const TLS_TIMEOUT_MS = parseInt(process.env.TLS_TIMEOUT_MS || '60000', 10);
const axiosConfig = { timeout: TLS_TIMEOUT_MS };

/**
 * TLS module: calls Mozilla TLS Observatory API.
 * Returns { statusCode, body } - body is the Mozilla API result (or error dict).
 * Server wraps as { success, data: body, durationMs }.
 */
const tlsHandler = async (url) => {
  const startTime = Date.now();

  try {
    const domain = new URL(url).hostname;
    const scanResponse = await axios.post(
      `${MOZILLA_TLS_OBSERVATORY_API}/scan?target=${domain}`,
      null,
      axiosConfig,
    );
    const scanId = scanResponse.data.scan_id;

    if (typeof scanId !== 'number') {
      return {
        statusCode: 500,
        body: {
          error: 'Failed to get scan_id from TLS Observatory',
          success: false,
        },
      };
    }

    const resultResponse = await axios.get(
      `${MOZILLA_TLS_OBSERVATORY_API}/results?id=${scanId}`,
      axiosConfig,
    );
    return {
      statusCode: 200,
      body: resultResponse.data,
    };
  } catch (error) {
    const msg = error?.message || String(error);
    const timedOut = msg.includes('timeout') || msg.includes('timed out');
    return {
      statusCode: 500,
      body: {
        error: msg,
        success: false,
        ...(timedOut ? { timedOut: true } : {}),
      },
    };
  }
};

export const handler = middleware(tlsHandler);
export default handler;
