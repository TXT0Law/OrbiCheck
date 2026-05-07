import { http } from './_common/http.js';
import middleware from './_common/middleware.js';
import { normalizeUrl } from './_common/url.js';

const httpsSecHandler = async (url) => {
  const fullUrl = normalizeUrl(url, { defaultProtocol: 'http://' });

  try {
    const response = await http.get(fullUrl);
    const headers = response.headers;
    return {
      strictTransportPolicy: headers['strict-transport-security'] ? true : false,
      xFrameOptions: headers['x-frame-options'] ? true : false,
      xContentTypeOptions: headers['x-content-type-options'] ? true : false,
      xXSSProtection: headers['x-xss-protection'] ? true : false,
      contentSecurityPolicy: headers['content-security-policy'] ? true : false,
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};

export const handler = middleware(httpsSecHandler);
export default handler;
