import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { config, middleware } from "@/middleware";

describe("dashboard route middleware", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows anonymous dashboard requests in development bypass mode", () => {
    vi.stubEnv("NEXT_PUBLIC_AUTH_DEV_BYPASS_ENABLED", "true");
    const request = new NextRequest("http://localhost/dashboard");

    const response = middleware(request);

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("redirects anonymous dashboard requests to login", () => {
    const request = new NextRequest("http://localhost/dashboard/reports");

    const response = middleware(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/login");
  });

  it("allows dashboard requests with a session cookie", () => {
    const request = new NextRequest("http://localhost/dashboard", {
      headers: { cookie: "orbicheck_auth=signed-session" },
    });

    const response = middleware(request);

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("matches every dashboard route", () => {
    expect(config.matcher).toEqual(["/dashboard/:path*"]);
  });
});
