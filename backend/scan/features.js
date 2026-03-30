import https from 'https';

import middleware from './_common/middleware.js';

const featuresHandler = async (url) => {
  const startTime = Date.now();
  const apiKey = process.env.BUILT_WITH_API_KEY;

  if (!url) {
    return {
      success: false,
      data: { Results: [], features: [] },
      error: 'URL query parameter is required',
      duration_ms: Date.now() - startTime,
    };
  }

  if (!apiKey) {
    return {
      success: true,
      Results: [],
      features: [],
      data: {
        Results: [],
        features: [],
        note: 'BuiltWith API key not configured. Set BUILT_WITH_API_KEY in .env (see .env.example). Features fall back to tech-stack when available.',
      },
      duration_ms: Date.now() - startTime,
    };
  }

  const apiUrl = `https://api.builtwith.com/free1/api.json?KEY=${apiKey}&LOOKUP=${encodeURIComponent(url)}`;

  try {
    const response = await new Promise((resolve, reject) => {
      const req = https.get(apiUrl, res => {
        let data = '';

        res.on('data', chunk => {
          data += chunk;
        });

        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode <= 299) {
            resolve(data);
          } else {
            reject(new Error(`Request failed with status code: ${res.statusCode}`));
          }
        });
      });

      req.on('error', error => {
        reject(error);
      });

      req.end();
    });

    if (typeof response !== 'string') {
      return response;
    }

    const parsed = JSON.parse(response);
    return {
      success: true,
      ...parsed,
      duration_ms: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      data: { Results: [], features: [] },
      error: error.message || 'Feature detection failed',
      duration_ms: Date.now() - startTime,
    };
  }
};

export const handler = middleware(featuresHandler);
export default handler;
