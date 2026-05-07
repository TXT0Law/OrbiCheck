import tls from 'tls';

import middleware from './_common/middleware.js';

/**
 * Local TLS probe that replaces the retired Mozilla TLS Observatory.
 *
 * For every TLS version we care about, we open a fresh `tls.connect()`
 * pinning the protocol via `minVersion`/`maxVersion`. If the handshake
 * succeeds we record the negotiated cipher; if it fails we mark the
 * version as unsupported. The aggregated result keeps Mozilla-compatible
 * keys (`connection.protocols`, `connection.ciphers`, `certificates`,
 * `forward_secrecy`, ...) so that
 * `backend/app/services/transformers.py::transform_tls` can consume the
 * payload without changes.
 */

const TLS_VERSIONS = [
  { name: 'TLSv1.3', min: 'TLSv1.3', max: 'TLSv1.3', secure: 'good' },
  { name: 'TLSv1.2', min: 'TLSv1.2', max: 'TLSv1.2', secure: 'good' },
  { name: 'TLSv1.1', min: 'TLSv1.1', max: 'TLSv1.1', secure: 'warning' },
  { name: 'TLSv1.0', min: 'TLSv1', max: 'TLSv1', secure: 'warning' },
];

const TLS_TIMEOUT_MS = parseInt(process.env.TLS_TIMEOUT_MS || '8000', 10);
const FORWARD_SECRECY_TOKENS = ['ECDHE', 'DHE', 'TLS_AES', 'TLS_CHACHA20'];
const WEAK_CIPHER_TOKENS = ['RC4', 'NULL', 'EXPORT', 'DES', '3DES', 'MD5', 'ANON'];

function defaultPort(parsedUrl) {
  if (parsedUrl.port) return parseInt(parsedUrl.port, 10);
  return 443;
}

function probeProtocol(host, port, version, tlsModule) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (payload) => {
      if (!settled) {
        settled = true;
        resolve(payload);
      }
    };

    let socket;
    try {
      socket = tlsModule.connect(
        {
          host,
          port,
          servername: host,
          minVersion: version.min,
          maxVersion: version.max,
          ALPNProtocols: ['h2', 'http/1.1'],
          rejectUnauthorized: false,
        },
        () => {
          let cipher;
          let alpn;
          let peerCert;
          try {
            cipher = typeof socket.getCipher === 'function' ? socket.getCipher() : null;
            alpn = typeof socket.alpnProtocol !== 'undefined' ? socket.alpnProtocol : null;
            peerCert = typeof socket.getPeerCertificate === 'function'
              ? socket.getPeerCertificate(true)
              : null;
          } catch (_err) {
            cipher = null;
          }
          try {
            socket.end();
          } catch (_err) {
            // already destroyed; nothing to do
          }
          finish({ supported: true, cipher, peerCert, alpn });
        },
      );
    } catch (error) {
      finish({ supported: false, error: error?.message });
      return;
    }

    socket.setTimeout(TLS_TIMEOUT_MS, () => {
      finish({ supported: false, error: `TLS connection timed out after ${TLS_TIMEOUT_MS}ms` });
      try {
        socket.destroy();
      } catch (_err) {
        // socket already destroyed
      }
    });

    socket.on('error', (error) => {
      finish({ supported: false, error: error?.message });
    });
  });
}

function classifyCipher(name) {
  if (!name) return 'unknown';
  const upper = name.toUpperCase();
  if (WEAK_CIPHER_TOKENS.some((token) => upper.includes(token))) return 'weak';
  if (FORWARD_SECRECY_TOKENS.some((token) => upper.includes(token))) return 'strong';
  return 'acceptable';
}

function hasForwardSecrecy(name) {
  if (!name) return false;
  const upper = name.toUpperCase();
  return FORWARD_SECRECY_TOKENS.some((token) => upper.includes(token));
}

function flattenCertificate(cert) {
  if (!cert || typeof cert !== 'object') return null;
  // The Node.js peer certificate object includes a recursive `issuerCertificate`
  // pointer that ultimately self-references the root. Stripping it keeps the
  // payload JSON-serialisable for the scan database.
  const { raw: _raw, issuerCertificate: _issuerCert, ...rest } = cert;
  return rest;
}

function buildCertificateChain(peerCert) {
  if (!peerCert || typeof peerCert !== 'object') return [];
  const chain = [];
  const seen = new Set();
  let current = peerCert;
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    const flat = flattenCertificate(current);
    if (flat) chain.push(flat);
    current = current.issuerCertificate && current.issuerCertificate !== current
      ? current.issuerCertificate
      : null;
  }
  return chain;
}

function computeGrade(protocols, ciphers) {
  const supportedNames = protocols.filter((p) => p.supported).map((p) => p.name);
  const hasModern = supportedNames.includes('TLSv1.3') || supportedNames.includes('TLSv1.2');
  const hasLegacy = supportedNames.includes('TLSv1.0') || supportedNames.includes('TLSv1.1');
  const anyWeak = ciphers.some((c) => c.strength === 'weak');
  const allModernFs = ciphers.length > 0 && ciphers.every((c) => c.forwardSecrecy);

  if (!hasModern) return 'F';
  if (anyWeak) return 'C';
  if (hasLegacy) return 'B';
  if (allModernFs && supportedNames.includes('TLSv1.3')) return 'A+';
  return 'A';
}

async function runTlsProbe(rawUrl, tlsModule) {
  const parsedUrl = new URL(rawUrl);
  const host = parsedUrl.hostname;
  const port = defaultPort(parsedUrl);

  const probeResults = await Promise.all(
    TLS_VERSIONS.map(async (version) => ({
      version,
      result: await probeProtocol(host, port, version, tlsModule),
    })),
  );

  const protocols = probeResults.map(({ version, result }) => ({
    name: version.name,
    supported: !!result.supported,
    secure: version.secure,
  }));

  const ciphers = [];
  let firstPeerCert = null;
  let alpnList = null;
  for (const { version, result } of probeResults) {
    if (!result.supported) continue;
    if (result.cipher && result.cipher.name) {
      ciphers.push({
        name: result.cipher.name,
        protocol: version.name,
        strength: classifyCipher(result.cipher.name),
        forwardSecrecy: hasForwardSecrecy(result.cipher.name),
      });
    }
    if (!firstPeerCert && result.peerCert) {
      firstPeerCert = result.peerCert;
    }
    if (alpnList === null && result.alpn) {
      alpnList = [result.alpn];
    }
  }

  const certificates = buildCertificateChain(firstPeerCert);
  const supported = protocols.some((p) => p.supported);
  if (!supported) {
    const errorReason = probeResults
      .map(({ result }) => result.error)
      .find((msg) => typeof msg === 'string' && msg.length > 0);
    throw new Error(errorReason || 'No supported TLS versions detected');
  }

  return {
    grade: computeGrade(protocols, ciphers),
    connection: { protocols, ciphers, ciphersuite: ciphers },
    protocols,
    ciphers,
    certificates,
    forward_secrecy: ciphers.length > 0 && ciphers.every((c) => c.forwardSecrecy),
    alpn: alpnList,
    sni: true,
    target: { host, port },
  };
}

export const buildTlsHandler = (tlsModule) => async (rawUrl) => {
  const startedAt = Date.now();
  try {
    const data = await runTlsProbe(rawUrl, tlsModule);
    return {
      statusCode: 200,
      body: {
        success: true,
        data,
        durationMs: Date.now() - startedAt,
      },
    };
  } catch (error) {
    const message = error?.message || String(error);
    const timedOut = /timed out/i.test(message);
    return {
      statusCode: 500,
      body: {
        success: false,
        error: message,
        durationMs: Date.now() - startedAt,
        ...(timedOut ? { timedOut: true } : {}),
      },
    };
  }
};

const tlsHandler = buildTlsHandler(tls);

export const handler = middleware(tlsHandler);
export default handler;
