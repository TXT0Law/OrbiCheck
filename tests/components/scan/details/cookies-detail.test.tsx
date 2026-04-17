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

  it("wraps long cookie domain and path values inside the table", () => {
    const longDomain = ".really-long-cookie-domain-name-for-testing-overflow.example.com";
    const longPath = "/very/deeply/nested/cookie/path/segment/that/should/wrap/within/the/card/boundary";
    const longExpires = "Thu, 31 Dec 2099 23:59:59 GMT (override-by-server-policy-flag-set)";

    render(
      <CookiesDetail
        data={{
          cookies: [
            {
              name: "tracking_session_identifier_for_long_value_test",
              domain: longDomain,
              path: longPath,
              secure: true,
              httpOnly: true,
              sameSite: "lax",
              expires: longExpires,
            },
          ],
          issuesCount: 0,
        }}
      />,
    );

    const domainCell = screen.getByText(longDomain);
    expect(domainCell.className).toMatch(/break-all/);
    expect(domainCell.className).toMatch(/max-w-\[/);

    const pathCell = screen.getByText(longPath);
    expect(pathCell.className).toMatch(/break-all/);
    expect(pathCell.className).toMatch(/max-w-\[/);

    const expiresCell = screen.getByText(longExpires);
    expect(expiresCell.className).toMatch(/break-all/);
    expect(expiresCell.className).toMatch(/max-w-\[/);
  });
});
