import { describe, expect, it } from "vitest";

import {
  getCsrfToken,
  getUserEmail,
  isLoggedIn,
  login,
  logout,
} from "@/lib/auth";

describe("auth helpers", () => {
  it("login resolves without throwing in local mode", async () => {
    await expect(login("admin@example.com", "password")).resolves.toBeUndefined();
  });

  it("logout resolves without throwing in local mode", async () => {
    await expect(logout()).resolves.toBeUndefined();
  });

  it("returns local-mode auth defaults", async () => {
    await expect(isLoggedIn()).resolves.toBe(true);
    expect(getUserEmail()).toBe("Local Mode");
    expect(getCsrfToken()).toBe("");
  });
});
