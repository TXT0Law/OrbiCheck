// Shared helpers for module tests. Every scan handler now responds with the
// standard envelope `{ success, data, error?, durationMs, statusCode }`; these
// helpers let test cases focus on the inner module payload.

export function unwrap(envelope) {
  if (envelope && typeof envelope === 'object' && 'success' in envelope && 'data' in envelope) {
    return envelope.data;
  }
  return envelope;
}

export function expectEnvelopeShape(envelope) {
  if (!envelope || typeof envelope !== 'object') {
    throw new Error(`Expected an envelope object, received ${typeof envelope}`);
  }
  for (const key of ['success', 'data', 'durationMs']) {
    if (!(key in envelope)) {
      throw new Error(`Envelope missing required key: ${key}`);
    }
  }
}

export function isErrorEnvelope(envelope) {
  return Boolean(envelope && typeof envelope === 'object' && envelope.success === false);
}

export function envelopeError(envelope) {
  if (!envelope || typeof envelope !== 'object') return null;
  return envelope.error || null;
}
