import {
  createSafeHttpAdapter,
  isPublicAddress,
  resolvePublicUrl,
  UnsafeUrlError,
} from '../_common/url-safety.js';

describe('outbound URL safety policy', () => {
  it.each([
    '127.0.0.1',
    '10.0.0.1',
    '169.254.169.254',
    '::1',
    'fe80::1',
    'fc00::1',
    '224.0.0.1',
  ])('rejects non-public address %s', (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it('rejects URL credentials', async () => {
    await expect(resolvePublicUrl(
      'https://user:password@example.com',
      { allowPrivate: false },
    )).rejects.toThrow(UnsafeUrlError);
  });

  it('rejects mixed public and private DNS answers', async () => {
    const lookup = async () => [
      { address: '93.184.216.34', family: 4 },
      { address: '10.0.0.9', family: 4 },
    ];

    await expect(resolvePublicUrl(
      'https://mixed.example',
      { lookup, allowPrivate: false },
    )).rejects.toThrow(/blocked network/);
  });

  it('returns a public address that can be pinned by the caller', async () => {
    const lookup = async () => [
      { address: '93.184.216.34', family: 4 },
    ];

    const resolved = await resolvePublicUrl(
      'https://example.com/path',
      { lookup, allowPrivate: false },
    );

    expect(resolved.hostname).toBe('example.com');
    expect(resolved.address).toBe('93.184.216.34');
    expect(resolved.port).toBe(443);
  });

  it('pins the validated address in the Node connection lookup', async () => {
    const resolveUrl = async (url) => ({
      url: new URL(url),
      hostname: 'example.com',
      address: '93.184.216.34',
      family: 4,
      port: 443,
      addresses: [{ address: '93.184.216.34', family: 4 }],
    });
    let connectedAddress;
    const adapter = async (config) => {
      config.httpsAgent.options.lookup('example.com', {}, (_error, address) => {
        connectedAddress = address;
      });
      return {
        status: 200,
        headers: {},
        data: 'ok',
        config,
      };
    };
    const safeAdapter = createSafeHttpAdapter({ resolveUrl, adapter });

    await safeAdapter({
      url: 'https://example.com',
      method: 'get',
      headers: {},
    });

    expect(connectedAddress).toBe('93.184.216.34');
  });

  it('revalidates redirect destinations before a second connection', async () => {
    const resolveUrl = async (url) => {
      if (url.includes('169.254.169.254')) {
        throw new UnsafeUrlError('URL resolves to blocked network');
      }
      return {
        url: new URL(url),
        hostname: 'example.com',
        address: '93.184.216.34',
        family: 4,
        port: 443,
        addresses: [{ address: '93.184.216.34', family: 4 }],
      };
    };
    let requests = 0;
    const adapter = async (config) => {
      requests += 1;
      return {
        status: 302,
        headers: { location: 'http://169.254.169.254/latest/meta-data' },
        data: '',
        config,
      };
    };
    const safeAdapter = createSafeHttpAdapter({ resolveUrl, adapter });

    await expect(safeAdapter({
      url: 'https://example.com',
      method: 'get',
      headers: {},
    })).rejects.toThrow(/blocked network/);
    expect(requests).toBe(1);
  });
});
