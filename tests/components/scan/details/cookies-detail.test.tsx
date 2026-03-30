import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CookiesDetail } from "@/components/scan/details/cookies-detail";

describe("CookiesDetail", () => {
  it("renders cookie rows and issue summary", () => {
    render(
      <CookiesDetail
        data={{
          cookies: [
            {
              name: "session",
              domain: ".example.com",
              path: "/",
              secure: true,
              httpOnly: true,
              sameSite: "strict",
              expires: "Session",
            },
          ],
          issuesCount: 1,
        }}
      />,
    );

    expect(screen.getByText("Cookie Analysis")).toBeInTheDocument();
    expect(screen.getByText(/Total: 1 cookies/i)).toBeInTheDocument();
    expect(screen.getByText("session")).toBeInTheDocument();
    expect(screen.getByText("strict")).toBeInTheDocument();
  });

  it("shows empty state when no cookies exist", () => {
    render(<CookiesDetail data={{ cookies: [], issuesCount: 0 }} />);

    expect(screen.getByText("No cookies detected for this site.")).toBeInTheDocument();
  });

  it("normalizes unknown samesite values to none", () => {
    render(
      <CookiesDetail
        data={{
          cookies: [
            {
              name: "legacy",
              domain: ".example.com",
              path: "/",
              secure: false,
              httpOnly: false,
              sameSite: "weird" as never,
              expires: "Tomorrow",
            },
          ],
          issuesCount: 0,
        }}
      />,
    );

    expect(screen.getByText("none")).toBeInTheDocument();
  });
});
