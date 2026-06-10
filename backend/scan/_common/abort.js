export const ABORT_ERROR_CODE = 'SCAN_ABORTED';

export function createAbortError(message = 'Scan work aborted') {
  const error = new Error(message);
  error.name = 'AbortError';
  error.code = ABORT_ERROR_CODE;
  return error;
}

export function isAbortError(error) {
  return Boolean(
    error
      && (
        error.name === 'AbortError'
        || error.code === ABORT_ERROR_CODE
        || error.code === 'ABORT_ERR'
        || error.code === 'RUNNER_TIMEOUT'
        || error.code === 'MIDDLEWARE_TIMEOUT'
      ),
  );
}

export function getRequestSignal(request, options = {}) {
  return options.signal || request?.context?.signal || request?.signal || null;
}

export function throwIfAborted(signal) {
  if (signal?.aborted) {
    throw signal.reason || createAbortError();
  }
}

export function createLinkedAbortController(parentSignal, timeoutMs) {
  const controller = new AbortController();
  let timer = null;

  const abort = (reason) => {
    if (!controller.signal.aborted) {
      controller.abort(reason || createAbortError());
    }
  };

  const onParentAbort = () => abort(parentSignal.reason || createAbortError());

  if (parentSignal) {
    if (parentSignal.aborted) {
      onParentAbort();
    } else {
      parentSignal.addEventListener('abort', onParentAbort, { once: true });
    }
  }

  if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
    timer = setTimeout(() => {
      const error = new Error(`Operation timed out after ${timeoutMs}ms`);
      error.code = 'OPERATION_TIMEOUT';
      abort(error);
    }, timeoutMs);
  }

  const cleanup = () => {
    if (timer) clearTimeout(timer);
    if (parentSignal) {
      parentSignal.removeEventListener('abort', onParentAbort);
    }
  };

  return { controller, signal: controller.signal, cleanup, abort };
}
