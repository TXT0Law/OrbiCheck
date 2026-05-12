import xml2js from 'xml2js';

import { http } from './_common/http.js';
import middleware from './_common/middleware.js';

const PROVIDER_TIMEOUT_MS = parseInt(process.env.THREATS_PROVIDER_TIMEOUT_MS || '5000', 10);
const USER_AGENT = 'OrbiCheck/1.0 (+https://github.com/orbicheck)';

// S-9: tokens that signal "the provider was never reached because the operator
// has not configured an API key" rather than a transient upstream failure.
// We use these to convert "all four failed" into a `skipped` envelope so the
// UI can render a neutral state instead of a noisy red error block.
const MISSING_KEY_MARKERS = ['API key required', 'API_KEY', '_API_KEY'];

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
    return { error: 'GOOGLE_CLOUD_API_KEY is required for the Google Safe Browsing check', missingApiKey: true };
  }
  try {
    const apiEndpoint = `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${apiKey}`;
    const response = await http.post(apiEndpoint, buildSafeBrowsingBody(url), {
      timeout: PROVIDER_TIMEOUT_MS,
      headers: { 'User-Agent': USER_AGENT },
    });
    if (response.status >= 400) {
      return { error: `Google Safe Browsing returned HTTP ${response.status}` };
    }
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
    const response = await http.post(
      'https://urlhaus-api.abuse.ch/v1/host/',
      `host=${domain}`,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': USER_AGENT,
        },
        timeout: PROVIDER_TIMEOUT_MS,
      },
    );
    if (response.status >= 400) {
      return { error: `URLHaus returned HTTP ${response.status}` };
    }
    return response.data;
  } catch (error) {
    return { error: `Request to URLHaus failed: ${error.message}` };
  }
};

const getPhishTankResult = async (url) => {
  try {
    const encodedUrl = Buffer.from(url).toString('base64');
    const endpoint = `https://checkurl.phishtank.com/checkurl/?url=${encodedUrl}`;
    const response = await http.post(endpoint, null, {
      headers: { 'User-Agent': USER_AGENT },
      timeout: PROVIDER_TIMEOUT_MS,
    });
    if (response.status >= 400) {
      return { error: `Request to PhishTank failed: HTTP ${response.status}` };
    }
    const parsed = await xml2js.parseStringPromise(response.data, { explicitArray: false });
    return parsed.response.results;
  } catch (error) {
    return { error: `Request to PhishTank failed: ${error.message}` };
  }
};

const getCloudmersiveResult = async (url) => {
  const apiKey = process.env.CLOUDMERSIVE_API_KEY;
  if (!apiKey) {
    return { error: 'CLOUDMERSIVE_API_KEY is required for the Cloudmersive check', missingApiKey: true };
  }
  try {
    const endpoint = 'https://api.cloudmersive.com/virus/scan/website';
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT,
      Apikey: apiKey,
    };
    const data = `Url=${encodeURIComponent(url)}`;
    const response = await http.post(endpoint, data, {
      headers,
      timeout: PROVIDER_TIMEOUT_MS,
    });
    if (response.status >= 400) {
      return { error: `Cloudmersive returned HTTP ${response.status}` };
    }
    return response.data;
  } catch (error) {
    return { error: `Request to Cloudmersive failed: ${error.message}` };
  }
};

/**
 * Scan module: query 4 threat-intel providers (URLHaus, PhishTank,
 * Cloudmersive, Google Safe Browsing) in parallel (P0-4) and aggregate
 * verdicts.
 *
 * @param {string} url Normalised target URL.
 * @returns {Promise<{urlHaus?: object, phishTank?: object,
 *   cloudmersive?: object, safeBrowsing?: object, error?: string}>}
 */
const isMissingKeyError = (entry) => {
  if (!entry || typeof entry !== 'object' || !('error' in entry)) return false;
  if (entry.missingApiKey === true) return true;
  const msg = String(entry.error || '');
  return MISSING_KEY_MARKERS.some((marker) => msg.includes(marker));
};

const isProviderError = (entry) =>
  entry && typeof entry === 'object' && 'error' in entry;

const threatsHandler = async (url) => {
  const [urlHaus, phishTank, cloudmersive, safeBrowsing] = await Promise.all([
    getUrlHausResult(url),
    getPhishTankResult(url),
    getCloudmersiveResult(url),
    getGoogleSafeBrowsingResult(url),
  ]);

  const providers = [urlHaus, phishTank, cloudmersive, safeBrowsing];
  const allFailed = providers.every(isProviderError);
  // S-9 / R-2: when ALL providers fail and AT LEAST ONE is missing an API
  // key, treat the module as ``skipped`` — the operator hasn't opted in to
  // threat-intel scanning, and the remaining providers (URLHaus / PhishTank)
  // failing for unrelated reasons should not promote the module to a hard
  // RED ❌ in the UI. The skipped envelope still preserves per-provider
  // detail so operators can see exactly what went wrong with each.
  // Tightening this further (require all-missing-key) was the original
  // wave-2 design but in real Docker deploys the reachable providers also
  // intermittently time out, so the user constantly sees a misleading hard
  // failure when in fact they just need to add API keys.
  if (allFailed) {
    const anyMissingKey = providers.some(isMissingKeyError);
    if (anyMissingKey) {
      const note =
        'Set GOOGLE_CLOUD_API_KEY and/or CLOUDMERSIVE_API_KEY to enable threat-intel scanning. '
        + 'Some providers also returned errors — see per-provider detail below.';
      return {
        success: true,
        data: {
          skipped: 'No threat-intel API keys configured',
          note,
          urlHaus,
          phishTank,
          cloudmersive,
          safeBrowsing,
        },
        skipped: true,
      };
    }
    throw new Error(
      `All threat providers failed - urlHaus: ${urlHaus.error}; phishTank: ${phishTank.error}; cloudmersive: ${cloudmersive.error}; safeBrowsing: ${safeBrowsing.error}`,
    );
  }

  return { urlHaus, phishTank, cloudmersive, safeBrowsing };
};

export const handler = middleware(threatsHandler);
export default handler;
