import { URL } from 'url';
import followRedirects from 'follow-redirects';
import middleware from './_common/middleware.js';

const { https } = followRedirects;

const SECURITY_TXT_PATHS = [
  '/security.txt',
  '/.well-known/security.txt',
];

const parseResult = (result) => {
  let output = {};
  let counts = {};
  const lines = result.split('\n');
  const regex = /^([^:]+):\s*(.+)$/;
  
  for (const line of lines) {
    if (!line.startsWith("#") && !line.startsWith("-----") && line.trim() !== '') {
      const match = line.match(regex);
      if (match && match.length > 2) {
        let key = match[1].trim();
        const value = match[2].trim();
        if (output.hasOwnProperty(key)) {
          counts[key] = counts[key] ? counts[key] + 1 : 1;
          key += counts[key];
        }
        output[key] = value;
      }
    }
  }
  
  return output;
};

const isPgpSigned = (result) => {
  if (result.includes('-----BEGIN PGP SIGNED MESSAGE-----')) {
    return true;
  }
  return false;
};

/**
 * Scan module: fetch `/.well-known/security.txt` and parse the RFC-9116
 * fields (Contact, Expires, Encryption, etc.).
 *
 * @param {string} urlParam Normalised target URL.
 * @returns {Promise<{isPresent: boolean, fields?: object, error?: string}>}
 */
const securityTxtHandler = async (urlParam) => {

  let url;
  try {
    url = new URL(urlParam.includes('://') ? urlParam : 'https://' + urlParam);
  } catch (error) {
    // P2-8: keep the underlying URL parser failure as cause for diagnosis.
    throw new Error('Invalid URL format', { cause: error });
  }
  url.pathname = '';
  
  for (let path of SECURITY_TXT_PATHS) {
    try {
      const result = await fetchSecurityTxt(url, path);
      if (result && result.includes('<html')) return { isPresent: false };
      if (result) {
        return {
          isPresent: true,
          foundIn: path,
          content: result,
          isPgpSigned: isPgpSigned(result),
          fields: parseResult(result),
        };
      }
    } catch (error) {
      // P2-8: preserve the original cause/stack instead of dropping it via
      // `throw new Error(error.message)`.
      throw new Error(`Failed to fetch ${path}: ${error.message}`, { cause: error });
    }
  }
  
  return { isPresent: false };
};

async function fetchSecurityTxt(baseURL, path) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseURL);
    https.get(url.toString(), (res) => {
      if (res.statusCode === 200) {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          resolve(data);
        });
      } else {
        resolve(null);
      }
    }).on('error', (err) => {
      reject(err);
    });
  });
}

export const handler = middleware(securityTxtHandler);
export default handler;
