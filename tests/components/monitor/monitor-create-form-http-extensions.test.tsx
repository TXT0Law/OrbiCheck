import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { MonitorCreateForm } from "@/components/monitor/monitor-create-form";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, back: vi.fn() }),
}));

const mutateAsync = vi.fn();
vi.mock("@/lib/hooks/use-monitors", () => ({
  useCreateMonitor: () => ({
    mutateAsync,
    isPending: false,
  }),
}));

describe("MonitorCreateForm HTTP extensions", () => {
  beforeEach(() => {
    pushMock.mockReset();
    mutateAsync.mockReset();
    mutateAsync.mockResolvedValue({ id: "mon-1" });
  });

  function fillRequiredFields() {
    fireEvent.change(screen.getByLabelText(/Display name/i), {
      target: { value: "extension-test" },
    });
    fireEvent.change(screen.getByLabelText(/^URL$/i), {
      target: { value: "https://example.com" },
    });
  }

  it("renders the Advanced HTTP collapsible", () => {
    render(<MonitorCreateForm />);
    expect(screen.getByTestId("monitor-advanced-http")).toBeInTheDocument();
    expect(screen.getByText(/Advanced HTTP settings/i)).toBeInTheDocument();
  });

  it("disables the body input for GET and submits without httpBody", async () => {
    render(<MonitorCreateForm />);
    fillRequiredFields();
    expect(screen.getByTestId("m-body")).toBeDisabled();
    fireEvent.submit(screen.getByRole("button", { name: /create monitor/i }));
    await screen.findByText(/Create monitor/i);
    expect(mutateAsync).toHaveBeenCalledTimes(1);
    const payload = mutateAsync.mock.calls[0][0];
    expect(payload.httpBody).toBeUndefined();
  });

  it("submits httpBody and httpHeaders when method is POST", async () => {
    render(<MonitorCreateForm />);
    fillRequiredFields();
    fireEvent.change(screen.getByLabelText(/HTTP method/i), {
      target: { value: "POST" },
    });
    expect(screen.getByTestId("m-body")).not.toBeDisabled();
    fireEvent.change(screen.getByTestId("m-body"), {
      target: { value: '{"hi":"there"}' },
    });
    fireEvent.change(screen.getByLabelText(/Header name 1/i), {
      target: { value: "X-Trace-Id" },
    });
    fireEvent.change(screen.getByLabelText(/Header value 1/i), {
      target: { value: "abc-123" },
    });
    fireEvent.submit(screen.getByRole("button", { name: /create monitor/i }));
    await screen.findByText(/Create monitor/i);
    const payload = mutateAsync.mock.calls[0][0];
    expect(payload.httpMethod).toBe("POST");
    expect(payload.httpBody).toBe('{"hi":"there"}');
    expect(payload.httpHeaders).toEqual({ "X-Trace-Id": "abc-123" });
  });

  it("submits httpAuth.bearer with the entered token", async () => {
    render(<MonitorCreateForm />);
    fillRequiredFields();
    fireEvent.change(screen.getByLabelText(/Authentication/i), {
      target: { value: "bearer" },
    });
    fireEvent.change(screen.getByTestId("m-auth-token"), {
      target: { value: "my-bearer-secret" },
    });
    fireEvent.submit(screen.getByRole("button", { name: /create monitor/i }));
    await screen.findByText(/Create monitor/i);
    const payload = mutateAsync.mock.calls[0][0];
    expect(payload.httpAuth).toEqual({
      scheme: "bearer",
      token: "my-bearer-secret",
    });
  });

  it("rejects forbidden header names with a form error", async () => {
    render(<MonitorCreateForm />);
    fillRequiredFields();
    fireEvent.change(screen.getByLabelText(/Header name 1/i), {
      target: { value: "Host" },
    });
    fireEvent.change(screen.getByLabelText(/Header value 1/i), {
      target: { value: "evil.example" },
    });
    fireEvent.submit(screen.getByRole("button", { name: /create monitor/i }));
    expect(await screen.findByText(/cannot override reserved header/i)).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});
