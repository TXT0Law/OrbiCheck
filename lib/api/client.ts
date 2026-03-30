import axios from "axios";

import { CSRF_COOKIE } from "@/lib/auth-constants";

/** Axios/backend errors with HTTP status and stable `error.code` (see FastAPI AppException). */
export class ApiError extends Error {
  readonly status?: number;
  readonly code?: string;
  readonly details?: unknown;

  constructor(
    message: string,
    options?: { status?: number; code?: string; details?: unknown; cause?: unknown }
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "ApiError";
    this.status = options?.status;
    this.code = options?.code;
    this.details = options?.details;
  }

  static isApiError(err: unknown): err is ApiError {
    return err instanceof ApiError;
  }
}

// In dev, prefer same-origin /api/v1 (Next.js proxy) to avoid cross-origin/CORS issues.
const raw = (process.env.NEXT_PUBLIC_API_URL ?? "").trim();
const API_BASE_URL = raw || "http://localhost:8000";
const isDefaultBackend =
  !raw ||
  raw === "http://localhost:8000" ||
  raw.startsWith("http://localhost:8000/") ||
  raw === "http://127.0.0.1:8000" ||
  raw.startsWith("http://127.0.0.1:8000/");
let basePath: string;
if (isDefaultBackend) {
  basePath = "/api/v1";
} else if (raw.startsWith("http")) {
  const base = raw.replace(/\/+$/, "");
  basePath = base.endsWith("/api/v1") ? base : `${base}/api/v1`;
} else {
  basePath = "/api/v1";
}

export const apiClient = axios.create({
  baseURL: basePath,
  timeout: 30_000,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

apiClient.interceptors.request.use((config) => {
  const method = (config.method || "get").toUpperCase();
  const needsCsrf = ["POST", "PUT", "PATCH", "DELETE"].includes(method);
  if (!needsCsrf || typeof document === "undefined") {
    return config;
  }

  const csrfToken =
    document.cookie
      .split("; ")
      .find((cookie) => cookie.startsWith(`${CSRF_COOKIE}=`))
      ?.split("=")[1] || "";
  if (csrfToken) {
    config.headers.set("X-CSRF-Token", csrfToken);
  }
  return config;
});

/** Absolute URL for browser fetch (cookie auth); use for non-JSON downloads (CSV/PDF). */
export function getBrowserApiAbsoluteUrl(apiPath: string): string {
  const p = apiPath.startsWith("/") ? apiPath : `/${apiPath}`;
  const base = (apiClient.defaults.baseURL as string | undefined) || "/api/v1";
  const root = typeof window !== "undefined" ? window.location.origin : "";
  return `${root}${base.replace(/\/$/, "")}${p}`;
}

apiClient.interceptors.response.use(
  (response) => {
    const body = response.data;

    if (body?.status === "success") {
      return {
        ...response,
        data: body.data,
        ...(body.meta != null
          ? { meta: body.meta as Record<string, unknown> }
          : {}),
      } as typeof response & { meta?: Record<string, unknown> };
    }

    return response;
  },
  (error) => {
    const status = error.response?.status as number | undefined;
    const detailPayload = error.response?.data?.detail;
    const errPayload = error.response?.data?.error;
    const code = typeof errPayload?.code === "string" ? errPayload.code : undefined;
    const backendMessage =
      typeof errPayload?.message === "string" ? errPayload.message : undefined;
    const validationMessage =
      Array.isArray(detailPayload) && detailPayload.length > 0
        ? String(detailPayload[0]?.msg ?? "")
        : undefined;
    const isNetworkError = !error.response && error.message === "Network Error";
    const message = isNetworkError
      ? API_BASE_URL.includes("65500")
        ? "Cannot reach API. NEXT_PUBLIC_API_URL is set to port 65500 (Playwright test URL). Unset it and restart, or set to http://localhost:8000."
        : `Cannot reach API at ${API_BASE_URL}. Check backend (port 8000), CORS, and network.`
      : backendMessage ?? validationMessage ?? error.message ?? "Unknown error";

    return Promise.reject(
      new ApiError(message, { status, code, details: detailPayload, cause: error })
    );
  }
);
