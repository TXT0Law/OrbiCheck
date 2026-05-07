import { http } from './_common/http.js';
import middleware from './_common/middleware.js';
import {
  WAF_BLOCK_ERROR_CODES,
  WAF_BLOCK_STATUSES,
  findMatchingSignature,
} from './_common/waf-signatures.js';
import { normalizeUrl } from './_common/url.js';

function buildPositive(label, evidence, blocked = false, statusCode = null) {
  return {
    hasWaf: true,
    waf: label,
    evidence,
    blocked,
    statusCode,
  };
}

function buildNegative() {
  return { hasWaf: false };
}

function inspectErrorResponse(error) {
  const errResponse = error && error.response;
  if (errResponse && errResponse.headers) {
    const match = findMatchingSignature(errResponse.headers, errResponse.status);
    if (match) {
      return buildPositive(match.label, match.evidence, true, errResponse.status || null);
    }
    if (WAF_BLOCK_STATUSES.has(errResponse.status)) {
      return buildPositive(
        'Unknown WAF',
        `blocked with status ${errResponse.status}`,
        true,
        errResponse.status,
      );
    }
  }
  if (error && WAF_BLOCK_ERROR_CODES.has(error.code)) {
    return buildPositive(
      'Unknown WAF',
      `connection terminated (${error.code})`,
      true,
      null,
    );
  }
  return null;
}

const firewallHandler = async (rawUrl) => {
  const url = normalizeUrl(rawUrl, { defaultProtocol: 'http://' });

  let response;
  try {
    response = await http.get(url);
  } catch (error) {
    const inferred = inspectErrorResponse(error);
    if (inferred) return inferred;
    throw new Error(`Failed to fetch URL for WAF inspection: ${error.message}`, { cause: error });
  }

  const status = response.status;
  if (WAF_BLOCK_STATUSES.has(status)) {
    const match = findMatchingSignature(response.headers, status);
    if (match) {
      return buildPositive(match.label, match.evidence, true, status);
    }
    return buildPositive(
      'Unknown WAF',
      `blocked with status ${status}`,
      true,
      status,
    );
  }

  const match = findMatchingSignature(response.headers, status);
  if (match) {
    return buildPositive(match.label, match.evidence, false, status);
  }

  return buildNegative();
};

export const handler = middleware(firewallHandler);
export default handler;
