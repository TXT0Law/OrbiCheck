// Common middleware for the OrbiCheck scan service.
// Wraps a pure module handler in an Express-style (req, res) function and
// enforces the global request timeout + CORS-friendly response shape.

const normalizeUrl = (url) => {
  return url.startsWith('http') ? url : `https://${url}`;
};

const TIMEOUT = process.env.API_TIMEOUT_LIMIT
  ? parseInt(process.env.API_TIMEOUT_LIMIT, 10)
  : 60000;

// Setting `VITE_DISABLE_EVERYTHING` puts the public instance into maintenance mode.
const DISABLE_EVERYTHING = !!process.env.VITE_DISABLE_EVERYTHING;

const TIMEOUT_ERROR_MESSAGE = 'You can re-trigger this request, by clicking "Retry"\n'
  + 'If you\'re running your own instance of OrbiCheck, then you can resolve '
  + 'this issue, by increasing the timeout limit in the `API_TIMEOUT_LIMIT` '
  + 'environmental variable to a higher value (in milliseconds).\n\n'
  + `The public instance currently has a lower timeout of ${TIMEOUT}ms in order `
  + 'to keep running costs affordable, so that OrbiCheck can remain freely '
  + 'available for everyone.';

const DISABLED_ERROR_MESSAGE = 'Error - OrbiCheck Temporarily Disabled.\n\n'
  + 'We\'re sorry, but due to the increased cost of running OrbiCheck '
  + 'we\'ve had to temporarily disable the public instance. We\'re actively '
  + 'looking for affordable ways to keep OrbiCheck running, while free to use '
  + 'for everybody.\n'
  + 'In the meantime, since we\'ve made our code free and open source, '
  + 'you can get OrbiCheck running on your own system, by following the '
  + 'instructions in our GitHub repo.';

const GENERIC_ERROR_MESSAGE = 'Request failed while processing this scan module.';

const createTimeoutPromise = (timeoutMs) => {
  let timer;
  const promise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Request timed-out after ${timeoutMs} ms`));
    }, timeoutMs);
  });
  return { promise, cancel: () => clearTimeout(timer) };
};

const commonMiddleware = (handler) => async (request, response) => {
  if (DISABLE_EVERYTHING) {
    return response.status(503).json({ error: DISABLED_ERROR_MESSAGE });
  }

  const queryParams = request.query || {};
  const rawUrl = queryParams.url;

  if (!rawUrl) {
    return response.status(500).json({ error: 'No URL specified' });
  }

  const url = normalizeUrl(rawUrl);
  const timeout = createTimeoutPromise(TIMEOUT);

  try {
    const handlerResponse = await Promise.race([
      handler(url, request),
      timeout.promise,
    ]);

    if (
      handlerResponse
      && typeof handlerResponse === 'object'
      && 'body' in handlerResponse
      && 'statusCode' in handlerResponse
    ) {
      return response.status(handlerResponse.statusCode).json(handlerResponse.body);
    }

    const payload = typeof handlerResponse === 'object'
      ? handlerResponse
      : JSON.parse(handlerResponse);
    return response.status(200).json(payload);
  } catch (error) {
    const message = (error && error.message) ? error.message : '';
    if (message.includes('timed-out') || response.statusCode === 504) {
      return response.status(408).json({ error: TIMEOUT_ERROR_MESSAGE });
    }
    return response.status(500).json({ error: GENERIC_ERROR_MESSAGE });
  } finally {
    timeout.cancel();
  }
};

export default commonMiddleware;
