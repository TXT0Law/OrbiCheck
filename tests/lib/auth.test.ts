import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getCsrfToken,
  getUserEmail,
  isLoggedIn,
  login,
  logout,
} from "@/lib/auth";
import { ApiError } from "@/lib/api/client";
import { USER_EMAIL_KEY } from "@/lib/auth-constants";

const authApiMocks = vi.hoisted(() => ({
  createSession: vi.fn(),
  deleteSession: vi.fn(),
  readSession: vi.fn(),
}));

vi.mock("@/lib/api/auth", () => authApiMocks);

describe("auth helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    document.cookie = "orbicheck_csrf=; Max-Age=0; Path=/";
  });

  it("logs in through the API and stores the session email", async () => {
    authApiMocks.createSession.mockResolvedValue({
      authenticated: true,
      email: "admin@example.com",
    });

    await expect(login("admin@example.com", "password")).resolves.toEqual({
      authenticated: true,
      email: "admin@example.com",
    });

    expect(authApiMocks.createSession).toHaveBeenCalledWith({
      email: "admin@example.com",
      password: "password",
    });
    expect(getUserEmail()).toBe("admin@example.com");
  });

  it("logs out through the API and clears local session state", async () => {
    window.localStorage.setItem(USER_EMAIL_KEY, "admin@example.com");
    authApiMocks.deleteSession.mockResolvedValue(undefined);

    await expect(logout()).resolves.toBeUndefined();

    expect(authApiMocks.deleteSession).toHaveBeenCalledOnce();
    expect(getUserEmail()).toBe("Admin");
  });

  it("validates an active server session", async () => {
    authApiMocks.readSession.mockResolvedValue({
      authenticated: true,
      email: "admin@example.com",
    });

    await expect(isLoggedIn()).resolves.toBe(true);
    expect(getUserEmail()).toBe("admin@example.com");
  });

  it("returns false for an unauthenticated server response", async () => {
    authApiMocks.readSession.mockRejectedValue(
      new ApiError("Authentication required", { status: 401 })
    );

    await expect(isLoggedIn()).resolves.toBe(false);
  });

  it("reads the CSRF token from the browser cookie", () => {
    document.cookie = "orbicheck_csrf=csrf-token; Path=/";

    expect(getCsrfToken()).toBe("csrf-token");
  });
});
