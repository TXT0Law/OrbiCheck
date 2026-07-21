import tls from 'tls';

import middleware from './_common/middleware.js';
import { targetAddressFromRequest } from './_common/url-safety.js';

const SSL_TIMEOUT_MS = parseInt(process.env.SSL_TIMEOUT_MS || '15000', 10);

/**
 * Scan module: fetch the leaf SSL certificate via `tls.connect()` and
 * report subject / issuer / valid-from / valid-to / SAN list.
 *
 * @param {string} urlString Normalised target URL.
 * @returns {Promise<{subject?: object, issuer?: object, valid_from?: string,
 *   valid_to?: string, subjectaltname?: string, error?: string}>}
 */
const sslHandler = async (urlString, request) => {
  const startTime = Date.now();

  try {
    const parsedUrl = new URL(urlString);
    const options = {
      host: targetAddressFromRequest(request, parsedUrl.hostname),
      port: parsedUrl.port || 443,
      servername: parsedUrl.hostname,
      rejectUnauthorized: false,
    };

    const cert = await new Promise((resolve, reject) => {
      const socket = tls.connect(options, () => {
        if (!socket.authorized) {
          socket.end();
          return reject(new Error(
            `SSL handshake not authorized. Reason: ${socket.authorizationError}`,
          ));
        }

        const peerCert = socket.getPeerCertificate();
        if (!peerCert || Object.keys(peerCert).length === 0) {
          socket.end();
          return reject(new Error(
            'No certificate presented by the server. Server may not use SNI.',
          ));
        }

        const { raw: _raw, issuerCertificate: _issuerCert, ...certWithoutRaw } = peerCert;
        socket.end();
        resolve(certWithoutRaw);
      });

      socket.setTimeout(SSL_TIMEOUT_MS, () => {
        socket.destroy();
        reject(new Error(`SSL connection timed out after ${SSL_TIMEOUT_MS}ms`));
      });

      socket.on('error', (err) => {
        reject(new Error(`Error fetching site certificate: ${err.message}`));
      });
    });

    return cert;
  } catch (error) {
    return {
      success: false,
      data: {},
      error: error.message || 'SSL check failed',
      duration_ms: Date.now() - startTime,
    };
  }
};

export const handler = middleware(sslHandler);
export default handler;
