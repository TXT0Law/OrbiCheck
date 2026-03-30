import url from 'url';
import middleware from './_common/middleware.js';

const SAFE_HOSTNAME_PATTERN = /^[a-zA-Z0-9.-]+$/;

const traceRouteHandler = async (urlString, context) => {
  void context;
  // Parse the URL and get the hostname
  const urlObject = url.parse(urlString);
  const host = urlObject.hostname;

  if (!host) {
    throw new Error('Invalid URL provided');
  }

  if (!SAFE_HOSTNAME_PATTERN.test(host)) {
    throw new Error('Invalid hostname');
  }

  if (process.platform === 'win32') {
    return {
      message: 'Traceroute skipped on Windows in local development',
      result: [],
      warning: 'Traceroute module is not stable on this platform',
    };
  }

  return {
    message: 'Traceroute is temporarily disabled pending a safe execFile-based implementation.',
    result: [],
    warning: `Traceroute disabled for host ${host}`,
  };
};

export const handler = middleware(traceRouteHandler);
export default handler;
