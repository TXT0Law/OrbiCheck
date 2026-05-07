/**
 * DNS module: CAA formatting (pure) and handler resolveCaa behavior (mocked dns).
 */

import { jest } from '@jest/globals';

import { formatCaaRecords } from '../caa-format.js';

describe('formatCaaRecords', () => {
  it('formats Node-style CAA objects as RFC-like strings', () => {
    const out = formatCaaRecords([
      { critical: 0, issue: 'letsencrypt.org' },
      { critical: 128, issuewild: 'pki.goog' },
    ]);
    expect(out).toEqual(['0 issue "letsencrypt.org"', '128 issuewild "pki.goog"']);
  });

  it('passes through string records', () => {
    expect(formatCaaRecords(['0 issue "digicert.com"'])).toEqual(['0 issue "digicert.com"']);
  });

  it('returns empty array for non-array input (no CAA / ENODATA equivalent)', () => {
    expect(formatCaaRecords(null)).toEqual([]);
    expect(formatCaaRecords(undefined)).toEqual([]);
    expect(formatCaaRecords([])).toEqual([]);
  });
});

function dnsMockFactory(caaMode) {
  return {
    default: {
      promises: {},
      lookup: (hostname, cb) => cb(null, '127.0.0.1', 4),
      resolve4: (h, cb) => cb(null, ['127.0.0.1']),
      resolve6: (h, cb) => cb(Object.assign(new Error('ENODATA'), { code: 'ENODATA' })),
      resolveMx: (h, cb) => cb(null, []),
      resolveTxt: (h, cb) => cb(null, []),
      resolveNs: (h, cb) => cb(null, []),
      resolveCname: (h, cb) => cb(Object.assign(new Error('ENODATA'), { code: 'ENODATA' })),
      resolveSoa: (h, cb) =>
        cb(null, {
          nsname: 'ns.example.com',
          hostmaster: 'hostmaster.example.com',
          serial: 1,
          refresh: 10000,
          retry: 2400,
          expire: 604800,
          minttl: 3600,
        }),
      resolveSrv: (h, cb) => cb(Object.assign(new Error('ENODATA'), { code: 'ENODATA' })),
      resolvePtr: (h, cb) => cb(Object.assign(new Error('ENODATA'), { code: 'ENODATA' })),
      resolveCaa: (h, cb) => {
        process.nextTick(() => {
          if (caaMode === 'fail') {
            cb(Object.assign(new Error('queryCaa ENODATA'), { code: 'ENODATA' }));
          } else {
            cb(null, [{ critical: 0, issue: 'example.net' }]);
          }
        });
      },
    },
  };
}

async function runDnsHandlerWithMock(caaMode) {
  jest.resetModules();
  await jest.unstable_mockModule('dns', () => dnsMockFactory(caaMode));
  const { handler } = await import('../dns.js');
  const req = { query: { url: 'https://example.com' } };
  const res = {
    headersSent: false,
    statusCode: 200,
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(body) {
      this.headersSent = true;
      this.body = body;
      return this;
    },
  };
  await handler(req, res);
  return res.body;
}

describe('dns handler CAA (mocked dns)', () => {
  it('includes formatted CAA when resolveCaa succeeds', async () => {
    const body = await runDnsHandlerWithMock('ok');
    expect(body.success).toBe(true);
    expect(body.data.CAA).toEqual(['0 issue "example.net"']);
  });

  it('returns empty CAA when resolveCaa rejects (e.g. ENODATA)', async () => {
    const body = await runDnsHandlerWithMock('fail');
    expect(body.success).toBe(true);
    expect(body.data.CAA).toEqual([]);
  });
});
