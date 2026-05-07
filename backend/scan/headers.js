import { http } from './_common/http.js';
import middleware from './_common/middleware.js';

const headersHandler = async (url) => {
  try {
    const response = await http.get(url);
    return response.headers;
  } catch (error) {
    throw new Error(error.message, { cause: error });
  }
};

export const handler = middleware(headersHandler);
export default handler;
