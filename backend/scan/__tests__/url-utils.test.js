import { describe, expect, it } from '@jest/globals';

import {
  extractHostname,
  isSameOrigin,
  normalizeUrl,
} from '../_common/url.js';

describe('_common/url.normalizeUrl', () => {
  it('returns empty string for non-string input', () => {
    expect(normalizeUrl(null)).toBe('');
    expect(normalizeUrl(undefined)).toBe('');
    expect(normalizeUrl(42)).toBe('');
    expect(normalizeUrl({})).toBe('');
  });

  it('returns empty string for empty / whitespace input', () => {
    expect(normalizeUrl('')).toBe('');
    expect(normalizeUrl('   ')).toBe('');
  });

  it('preserves explicit http:// and https:// scheme', () => {
    expect(normalizeUrl('http://example.com')).toBe('http://example.com');
    expect(normalizeUrl('https://example.com/foo')).toBe('https://example.com/foo');
  });

  it('preserves uppercase scheme as-is (case-insensitive detection)', () => {
    expect(normalizeUrl('HTTPS://Example.com')).toBe('HTTPS://Example.com');
  });

  it('prepends https:// for bare hostnames', () => {
    expect(normalizeUrl('example.com')).toBe('https://example.com');
    expect(normalizeUrl('sub.example.com/path')).toBe('https://sub.example.com/path');
  });

  it('strips leading slashes before applying default protocol', () => {
    expect(normalizeUrl('//example.com')).toBe('https://example.com');
    expect(normalizeUrl('///example.com/x')).toBe('https://example.com/x');
  });

  it('respects explicit defaultProtocol override', () => {
    expect(normalizeUrl('example.com', { defaultProtocol: 'http://' }))
      .toBe('http://example.com');
  });
});

describe('_common/url.extractHostname', () => {
  it('returns empty string for invalid input', () => {
    expect(extractHostname('')).toBe('');
    expect(extractHostname(null)).toBe('');
    expect(extractHostname('   ')).toBe('');
  });

  it('extracts hostname from full URL', () => {
    expect(extractHostname('https://example.com/path?q=1')).toBe('example.com');
  });

  it('extracts hostname from bare domain string', () => {
    expect(extractHostname('example.com')).toBe('example.com');
    expect(extractHostname('sub.example.com')).toBe('sub.example.com');
  });

  it('returns empty string when URL parsing fails', () => {
    expect(extractHostname('http:// not a host')).toBe('');
  });
});

describe('_common/url.isSameOrigin', () => {
  it('returns true for matching hostnames regardless of scheme/path', () => {
    expect(isSameOrigin('https://example.com/a', 'http://example.com/b')).toBe(true);
    expect(isSameOrigin('example.com', 'https://example.com')).toBe(true);
  });

  it('is case-insensitive on hostname', () => {
    expect(isSameOrigin('https://Example.COM', 'https://example.com')).toBe(true);
  });

  it('rejects suffix-only matches (regression for example.com vs example.com.evil.com)', () => {
    expect(isSameOrigin('https://example.com', 'https://example.com.evil.com')).toBe(false);
    expect(isSameOrigin('https://example.com', 'https://attacker.com/example.com')).toBe(false);
  });

  it('returns false when either side is empty / unparseable', () => {
    expect(isSameOrigin('', 'https://example.com')).toBe(false);
    expect(isSameOrigin('https://example.com', '')).toBe(false);
    expect(isSameOrigin('not a url', 'also not')).toBe(false);
  });
});
