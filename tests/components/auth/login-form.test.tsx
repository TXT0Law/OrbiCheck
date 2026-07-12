import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LoginForm } from "@/components/auth/login-form";

const authMocks = vi.hoisted(() => ({
  login: vi.fn(),
}));
const routerMocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  isLoggedIn: vi.fn(),
  login: authMocks.login,
  logout: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => routerMocks,
}));

describe("LoginForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("submits credentials and routes to the dashboard", async () => {
    authMocks.login.mockResolvedValue({
      authenticated: true,
      email: "admin@example.com",
    });
    render(<LoginForm />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "admin@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(authMocks.login).toHaveBeenCalledWith(
        "admin@example.com",
        "password"
      );
    });
    expect(routerMocks.replace).toHaveBeenCalledWith("/dashboard");
    expect(routerMocks.refresh).toHaveBeenCalledOnce();
  });

  it("shows authentication failures", async () => {
    authMocks.login.mockRejectedValue(new Error("Invalid email or password"));
    render(<LoginForm />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "admin@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "wrong" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Invalid email or password"
    );
  });
});
