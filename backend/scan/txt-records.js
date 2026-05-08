import dns from 'dns/promises';
import middleware from './_common/middleware.js';

/**
 * Scan module: resolve TXT records and classify common ones (SPF, DMARC,
 * verification tokens for Google / Microsoft / Apple, etc.).
 *
 * @param {string} url Normalised target URL.
 * @returns {Promise<object>} TXT classification map.
 */
const txtRecordHandler = async (url) => {
  try {
    const parsedUrl = new URL(url);
    
    const txtRecords = await dns.resolveTxt(parsedUrl.hostname);

    // Parsing and formatting TXT records into a single object
    const readableTxtRecords = txtRecords.reduce((acc, recordArray) => {
      const recordObject = recordArray.reduce((recordAcc, recordString) => {
        const splitRecord = recordString.split('=');
        const key = splitRecord[0];
        const value = splitRecord.slice(1).join('=');
        return { ...recordAcc, [key]: value };
      }, {});
      return { ...acc, ...recordObject };
    }, {});

    return readableTxtRecords;

  } catch (error) {
    if (error.code === 'ERR_INVALID_URL') {
      // P2-8: preserve the underlying URL parse error as `cause` instead of
      // string-coercing the whole error object.
      throw new Error(`Invalid URL: ${error.message}`, { cause: error });
    }
    throw error;
  }
};

export const handler = middleware(txtRecordHandler);
export default handler;
