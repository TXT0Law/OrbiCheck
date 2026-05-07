import { http } from './_common/http.js';
import middleware from './_common/middleware.js';

const TRANCO_TIMEOUT_MS = parseInt(process.env.TRANCO_TIMEOUT_MS || '5000', 10);

const rankHandler = async (url) => {
  const domain = url ? new URL(url).hostname : null;
  if (!domain) throw new Error('Invalid URL');

  try {
    const config = { timeout: TRANCO_TIMEOUT_MS };
    if (process.env.TRANCO_API_KEY) {
      config.auth = {
        username: process.env.TRANCO_USERNAME,
        password: process.env.TRANCO_API_KEY,
      };
    }
    const response = await http.get(
      `https://tranco-list.eu/api/ranks/domain/${domain}`,
      config,
    );
    if (response.status >= 400) {
      return { error: `Unable to fetch rank, HTTP ${response.status}` };
    }
    if (!response.data || !response.data.ranks || response.data.ranks.length === 0) {
      return { skipped: `Skipping, as ${domain} isn't ranked in the top 100 million sites yet.` };
    }
    return response.data;
  } catch (error) {
    return { error: `Unable to fetch rank, ${error.message}` };
  }
};

export const handler = middleware(rankHandler);
export default handler;
