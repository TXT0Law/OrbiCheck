import { afterEach, describe, expect, it, vi } from "vitest";

const createMock = vi.fn();

vi.mock("axios", () => ({
  default: {
    create: createMock,
  },
}));

async function importClient() {
  vi.resetModules();

  const handlers: {
    onFulfilled?: (value: unknown) => unknown;
    onRejected?: (error: unknown) => unknown;
  } = {};

  const instance = {
    interceptors: {
      request: {
        use: vi.fn(),
      },
      response: {
        use: vi.fn((onFulfilled, onRejected) => {
          handlers.onFulfilled = onFulfilled;
          handlers.onRejected = onRejected;
        }),
      },
    },
  };

  createMock.mockReturnValue(instance);

  const mod = await import("@/lib/api/client");
  return { mod, handlers, instance };
}

describe("apiClient response interceptors", () => {
  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.NEXT_PUBLIC_API_URL;
  });

  it("creates axios instance with withCredentials for cookie auth on cross-origin API", async () => {
    await importClient();
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        withCredentials: true,
        timeout: 30_000,
        headers: { "Content-Type": "application/json" },
      })
    );
  });

  it("unwraps backend success envelope", async () => {
    const { handlers } = await importClient();

    const response = {
      data: {
        status: "success",
        data: { id: "scan-1" },
      },
      status: 200,
    };

    const transformed = handlers.onFulfilled?.(response) as { data: { id: string } };
    expect(transformed.data).toEqual({ id: "scan-1" });
  });

  it("keeps non-envelope responses unchanged", async () => {
    const { handlers } = await importClient();
    const response = { data: { plain: true }, status: 200 };

    const transformed = handlers.onFulfilled?.(response) as { data: { plain: boolean } };
    expect(transformed.data).toEqual({ plain: true });
  });

  it("maps backend error message", async () => {
    const { handlers } = await importClient();

    const error = {
      response: {
        data: {
          error: {
            message: "Bad input",
          },
        },
      },
      message: "Request failed",
    };

    await expect(handlers.onRejected?.(error)).rejects.toThrow("Bad input");
  });

  it("rejects with ApiError carrying status and error code", async () => {
    const { handlers, mod } = await importClient();

    const error = {
      response: {
        status: 404,
        data: {
          status: "error",
          error: {
            code: "CHANGE_NOT_FOUND",
            message: "Change does not belong to this monitor",
          },
        },
      },
      message: "Request failed",
    };

    let caught: unknown;
    try {
      await handlers.onRejected?.(error);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(mod.ApiError);
    const ae = caught as InstanceType<typeof mod.ApiError>;
    expect(ae.status).toBe(404);
    expect(ae.code).toBe("CHANGE_NOT_FOUND");
    expect(ae.message).toBe("Change does not belong to this monitor");
  });

  it("maps network error with API URL hint", async () => {
    process.env.NEXT_PUBLIC_API_URL = "http://api.example.test";
    const { handlers } = await importClient();

    const error = {
      response: undefined,
      message: "Network Error",
    };

    await expect(handlers.onRejected?.(error)).rejects.toThrow(
      "Cannot reach API at http://api.example.test. Check backend (port 8000), CORS, and network."
    );
  });

  it("falls back to generic message", async () => {
    const { handlers } = await importClient();

    const error = {
      response: undefined,
      message: "Unexpected",
    };

    await expect(handlers.onRejected?.(error)).rejects.toThrow("Unexpected");
  });
});
