import axios from 'axios';

import middleware from './_common/middleware.js';

const qualityHandler = async (url) => {
  const startTime = Date.now();
  const apiKey = process.env.GOOGLE_CLOUD_API_KEY;

  if (!apiKey) {
    return {
      success: true,
      data: {
        categories: [],
        note: 'Google Cloud API key not configured. Lighthouse analysis is disabled.',
      },
      duration_ms: Date.now() - startTime,
    };
  }

  const endpoint = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?`
    + `url=${encodeURIComponent(url)}&category=PERFORMANCE&category=ACCESSIBILITY`
    + `&category=BEST_PRACTICES&category=SEO&category=PWA&strategy=mobile`
    + `&key=${apiKey}`;

  try {
    const data = (await axios.get(endpoint)).data;
    return { success: true, ...data, duration_ms: Date.now() - startTime };
  } catch (error) {
    const status = error?.response?.status;
    const reason = error?.response?.data?.error?.message || error?.message || 'Unknown error';

    return {
      success: false,
      data: { categories: [] },
      error: status === 400
        ? `PageSpeed API rejected request (400). Verify GOOGLE_CLOUD_API_KEY and URL format. Reason: ${reason}`
        : `PageSpeed API request failed${status ? ` (${status})` : ''}: ${reason}`,
      duration_ms: Date.now() - startTime,
    };
  }
};

export const handler = middleware(qualityHandler);
export default handler;
