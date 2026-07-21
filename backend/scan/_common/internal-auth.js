import crypto from 'node:crypto';

const SIGNATURE_VERSION = 'v1';
const TIMESTAMP_HEADER = 'x-orbi-timestamp';
const SIGNATURE_HEADER = 'x-orbi-signature';
const DEFAULT_MAX_SKEW_SECONDS = 60;
const MIN_INTERNAL_SECRET_LENGTH = 32;
const HTTP_UNAUTHORIZED = 401;
const PLACEHOLDER_FRAGMENTS = ['change-me', 'replace-with', 'dev-only'];

function bodyDigest(body) {
  return crypto.createHash('sha256').update(body || Buffer.alloc(0)).digest('hex');
}

function signaturePayload({ timestamp, method, target, body }) {
  return [
    SIGNATURE_VERSION,
    timestamp,
    String(method).toUpperCase(),
    target,
    bodyDigest(body),
  ].join('\n');
}

export function buildInternalAuthHeaders({
  secret,
  method,
  target,
  body = Buffer.alloc(0),
  timestamp = Math.floor(Date.now() / 1000),
}) {
  if (!secret?.trim()) return {};
  const timestampText = String(timestamp);
  const signature = crypto
    .createHmac('sha256', secret.trim())
    .update(signaturePayload({
      timestamp: timestampText,
      method,
      target,
      body,
    }))
    .digest('hex');
  return {
    'X-Orbi-Timestamp': timestampText,
    'X-Orbi-Signature': `${SIGNATURE_VERSION}=${signature}`,
  };
}

function isAuthRequired() {
  return process.env.INTERNAL_SERVICE_AUTH_REQUIRED === 'true'
    || process.env.NODE_ENV === 'production'
    || Boolean(process.env.INTERNAL_SERVICE_SECRET?.trim());
}

export function validateInternalAuthConfiguration() {
  if (process.env.NODE_ENV !== 'production') return;
  const secret = process.env.INTERNAL_SERVICE_SECRET?.trim() || '';
  if (secret.length < MIN_INTERNAL_SECRET_LENGTH) {
    throw new Error(
      `INTERNAL_SERVICE_SECRET must be at least ${MIN_INTERNAL_SECRET_LENGTH} characters`,
    );
  }
  const lowered = secret.toLowerCase();
  if (PLACEHOLDER_FRAGMENTS.some((fragment) => lowered.includes(fragment))) {
    throw new Error('INTERNAL_SERVICE_SECRET contains a known placeholder');
  }
}

function unauthorized(res, reason) {
  return res.status(HTTP_UNAUTHORIZED).json({
    error: 'Internal service authentication required',
    code: reason,
  });
}

export function createInternalAuthMiddleware({
  now = () => Math.floor(Date.now() / 1000),
} = {}) {
  return (req, res, next) => {
    if (req.path === '/health' || !isAuthRequired()) {
      next();
      return;
    }

    const secret = process.env.INTERNAL_SERVICE_SECRET?.trim();
    if (!secret) {
      unauthorized(res, 'INTERNAL_AUTH_NOT_CONFIGURED');
      return;
    }
    const timestampText = req.get(TIMESTAMP_HEADER) || '';
    const supplied = req.get(SIGNATURE_HEADER) || '';
    const timestamp = Number.parseInt(timestampText, 10);
    const maxSkew = Number.parseInt(
      process.env.INTERNAL_SERVICE_AUTH_MAX_SKEW_SECONDS
        || String(DEFAULT_MAX_SKEW_SECONDS),
      10,
    );
    if (!Number.isInteger(timestamp) || Math.abs(now() - timestamp) > maxSkew) {
      unauthorized(res, 'INTERNAL_AUTH_EXPIRED');
      return;
    }

    const expected = buildInternalAuthHeaders({
      secret,
      method: req.method,
      target: req.originalUrl,
      body: req.rawBody || Buffer.alloc(0),
      timestamp,
    })['X-Orbi-Signature'];
    const suppliedBuffer = Buffer.from(supplied);
    const expectedBuffer = Buffer.from(expected);
    if (
      suppliedBuffer.length !== expectedBuffer.length
      || !crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)
    ) {
      unauthorized(res, 'INTERNAL_AUTH_INVALID');
      return;
    }
    next();
  };
}
