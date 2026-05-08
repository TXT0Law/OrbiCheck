import dns from 'dns';
import util from 'util';
import middleware from './_common/middleware.js';
import { formatCaaRecords } from './caa-format.js';

export { formatCaaRecords };

const resolveCaaAsync =
  typeof dns.promises?.resolveCaa === 'function'
    ? (hostname) => dns.promises.resolveCaa(hostname)
    : util.promisify(dns.resolveCaa);

const dnsHandler = async (url) => {
  let hostname = url;

  // Handle URLs by extracting hostname
  if (hostname.startsWith('http://') || hostname.startsWith('https://')) {
    hostname = new URL(hostname).hostname;
  }

  try {
    const lookupPromise = util.promisify(dns.lookup);
    const resolve4Promise = util.promisify(dns.resolve4);
    const resolve6Promise = util.promisify(dns.resolve6);
    const resolveMxPromise = util.promisify(dns.resolveMx);
    const resolveTxtPromise = util.promisify(dns.resolveTxt);
    const resolveNsPromise = util.promisify(dns.resolveNs);
    const resolveCnamePromise = util.promisify(dns.resolveCname);
    const resolveSoaPromise = util.promisify(dns.resolveSoa);
    const resolveSrvPromise = util.promisify(dns.resolveSrv);
    const resolvePtrPromise = util.promisify(dns.resolvePtr);

    const dnsResults = await Promise.all([
      lookupPromise(hostname),
      resolve4Promise(hostname).catch(() => []), // A record
      resolve6Promise(hostname).catch(() => []), // AAAA record
      resolveMxPromise(hostname).catch(() => []), // MX record
      resolveTxtPromise(hostname).catch(() => []), // TXT record
      resolveNsPromise(hostname).catch(() => []), // NS record
      resolveCnamePromise(hostname).catch(() => []), // CNAME record
      resolveSoaPromise(hostname).catch(() => []), // SOA record
      resolveSrvPromise(hostname).catch(() => []), // SRV record
      resolvePtrPromise(hostname).catch(() => []), // PTR record
      // ENODATA / ENOTFOUND / missing resolver: treat as no CAA (do not fail DNS module)
      resolveCaaAsync(hostname).catch(() => []),
    ]);

    const [a, aaaa, mx, txt, ns, cname, soa, srv, ptr] = dnsResults.slice(0, 10);
    const caaRaw = dnsResults[10];

    const CAA = formatCaaRecords(Array.isArray(caaRaw) ? caaRaw : []);

    return {
      A: a,
      AAAA: aaaa,
      MX: mx,
      TXT: txt,
      NS: ns,
      CNAME: cname,
      SOA: soa,
      SRV: srv,
      PTR: ptr,
      CAA,
    };
  } catch (error) {
    // P2-8: preserve the original cause/stack so failed lookups are
    // diagnosable from the structured logs instead of being flattened to a
    // bare message.
    throw new Error(`DNS resolution failed: ${error.message}`, { cause: error });
  }
};

export const handler = middleware(dnsHandler);
export default handler;
