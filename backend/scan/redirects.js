import got from 'got';
import middleware from './_common/middleware.js';

const redirectsHandler = async (url) => {
  const redirects = [url];
  try {
    const response = await got(url, {
      followRedirect: true,
      maxRedirects: 12,
      hooks: {
        beforeRedirect: [
          (_options, redirectResponse) => {
            const next = redirectResponse?.headers?.location;
            if (next) redirects.push(next);
          },
        ],
      },
    });

    // P2-6: `beforeRedirect` only fires when got is *about to* follow another
    // hop, so the terminal 200-OK URL was missing from the chain. Append it
    // explicitly (de-duped) so the frontend can display the true final
    // destination without inferring it.
    const finalUrl = response?.url || response?.requestUrl;
    if (finalUrl && redirects[redirects.length - 1] !== finalUrl) {
      redirects.push(finalUrl);
    }

    return {
      redirects: redirects,
    };
  } catch (error) {
    // P2-8: preserve original stack/cause instead of opaque rewrap so the
    // logger can surface the underlying network error.
    throw new Error(`Redirect resolution failed: ${error.message}`, { cause: error });
  }
};

export const handler = middleware(redirectsHandler);
export default handler;
