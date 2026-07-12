import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

const apiClientMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: apiClientMock,
}));

import {
  createSession,
  deleteSession,
  readSession,
} from "@/lib/api/auth";

describe("auth API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("parses login and session responses", async () => {
    const session = {
      authenticated: true,
      email: "admin@example.com",
    };
    apiClientMock.post.mockResolvedValueOnce({ data: session });
    apiClientMock.get.mockResolvedValueOnce({ data: session });

    await expect(
      createSession({ email: "admin@example.com", password: "password" })
    ).resolves.toEqual(session);
    await expect(readSession()).resolves.toEqual(session);

    expect(apiClientMock.post).toHaveBeenCalledWith("/auth/login", {
      email: "admin@example.com",
      password: "password",
    });
    expect(apiClientMock.get).toHaveBeenCalledWith("/auth/session");
  });

  it("rejects malformed session payloads at the API boundary", async () => {
    apiClientMock.get.mockResolvedValue({ data: { authenticated: true } });

    await expect(readSession()).rejects.toBeInstanceOf(ZodError);
  });

  it("parses the logout response", async () => {
    apiClientMock.post.mockResolvedValue({ data: { ok: true } });

    await expect(deleteSession()).resolves.toBeUndefined();
    expect(apiClientMock.post).toHaveBeenCalledWith("/auth/logout");
  });
});
