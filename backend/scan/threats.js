import axios from 'axios';
import xml2js from 'xml2js';

import middleware from './_common/middleware.js';

const PROVIDER_TIMEOUT_MS = parseInt(process.env.THREATS_PROVIDER_TIMEOUT_MS || '5000', 10);
const USER_AGENT = 'OrbiCheck/1.0 (+https://github.com/orbicheck)';

const buildSafeBrowsingBody = (url) => ({
  threatInfo: {
    threatTypes: [
      'MALWARE',
      'SOCIAL_ENGINEERING',
      'UNWANTED_SOFTWARE',
      'POTENTIALLY_HARMFUL_APPLICATION',
      'API_ABUSE',
    ],
    platformTypes: ['ANY_PLATFORM'],
    threatEntryTypes: ['URL'],
    threatEntries: [{ url }],
  },
});

const getGoogleSafeBrowsingResult = async (url) => {
  const apiKey = process.env.GOOGLE_CLOUD_API_KEY;
  if (!apiKey) {
    return { error: 'GOOGLE_CLOUD_API_KEY is required for the Google Safe Browsing check' };
  }
  try {
    const apiEndpoint = `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${apiKey}`;
    const response = await axios.post(apiEndpoint, buildSafeBrowsingBody(url), {
      timeout: PROVIDER_TIMEOUT_MS,
      headers: { 'User-Agent': USER_AGENT },
    });
    if (response.data && Array.isArray(response.data.matches) && response.data.matches.length > 0) {
      return { unsafe: true, details: response.data.matches };
    }
    return { unsafe: false };
  } catch (error) {
    return { error: `Request to Google Safe Browsing failed: ${error.message}` };
  }
};

const getUrlHausResult = async (url) => {
  try {
    const domain = new URL(url).hostname;
    const response = await axios({
      method: 'post',
      url: 'https://urlhaus-api.abuse.ch/v1/host/',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENT,
      },
      timeout: PROVIDER_TIMEOUT_MS,
      data: `host=${domain}`,
    });
    return response.data;
  } catch (error) {
    return { error: `Request to URLHaus failed: ${error.message}` };
  }
};

const getPhishTankResult = async (url) => {
  try {
    const encodedUrl = Buffer.from(url).toString('base64');
    const endpoint = `https://checkurl.phishtank.com/checkurl/?url=${encodedUrl}`;
    const response = await axios.post(endpoint, null, {
      headers: { 'User-Agent': USER_AGENT },
      timeout: PROVIDER_TIMEOUT_MS,
    });
    const parsed = await xml2js.parseStringPromise(response.data, { explicitArray: false });
    return parsed.response.results;
  } catch (error) {
    return { error: `Request to PhishTank failed: ${error.message}` };
  }
};

const getCloudmersiveResult = async (url) => {
  const apiKey = process.env.CLOUDMERSIVE_API_KEY;
  if (!apiKey) {
    return { error: 'CLOUDMERSIVE_API_KEY is required for the Cloudmersive check' };
  }
  try {
    const endpoint = 'https://api.cloudmersive.com/virus/scan/website';
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT,
      Apikey: apiKey,
    };
    const data = `Url=${encodeURIComponent(url)}`;
    const response = await axios.post(endpoint, data, {
      headers,
      timeout: PROVIDER_TIMEOUT_MS,
    });
    return response.data;
  } catch (error) {
    return { error: `Request to Cloudmersive failed: ${error.message}` };
  }
};

const threatsHandler = async (url) => {
  const [urlHaus, phishTank, cloudmersive, safeBrowsing] = await Promise.all([
    getUrlHausResult(url),
    getPhishTankResult(url),
    getCloudmersiveResult(url),
    getGoogleSafeBrowsingResult(url),
  ]);

  const allFailed = [urlHaus, phishTank, cloudmersive, safeBrowsing].every(
    (entry) => entry && typeof entry === 'object' && 'error' in entry,
  );
  if (allFailed) {
    throw new Error(
      `All threat providers failed - urlHaus: ${urlHaus.error}; phishTank: ${phishTank.error}; cloudmersive: ${cloudmersive.error}; safeBrowsing: ${safeBrowsing.error}`,
    );
  }

  return { urlHaus, phishTank, cloudmersive, safeBrowsing };
};

export const handler = middleware(threatsHandler);
export default handler;
