/**
 * @jest-environment node
 */

import {
  isEnrichmentSparse,
  mergeIpEnrichment,
} from '../_common/ip-enrichment.js';

describe('ip-enrichment', () => {
  it('merge prefers primary non-empty fields', () => {
    const a = {
      ip: '1.1.1.1',
      asn: '13335',
      isp: 'Cloudflare',
      org: '',
      country: 'United States',
      countryCode: 'US',
      region: 'CA',
      city: 'San Francisco',
      lat: 1,
      lon: 2,
      hostingProvider: '',
      isHosting: false,
    };
    const b = {
      ip: '1.1.1.1',
      asn: '',
      isp: 'Backup ISP',
      org: 'Org',
      country: '',
      countryCode: '',
      region: '',
      city: '',
      lat: undefined,
      lon: undefined,
      hostingProvider: '',
      isHosting: false,
    };
    const m = mergeIpEnrichment(a, b);
    expect(m.isp).toBe('Cloudflare');
    expect(m.org).toBe('Org');
    expect(m.country).toBe('United States');
  });

  it('isEnrichmentSparse is true when geo fields empty', () => {
    expect(
      isEnrichmentSparse({
        ip: '9.9.9.9',
        asn: '',
        isp: '',
        country: '',
        city: '',
      }),
    ).toBe(true);
  });

  it('isEnrichmentSparse is false when country present', () => {
    expect(
      isEnrichmentSparse({
        ip: '9.9.9.9',
        country: 'DE',
        isp: '',
        city: '',
        asn: '',
      }),
    ).toBe(false);
  });
});
