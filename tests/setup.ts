import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";

import { createElement } from "react";
import { afterEach } from "vitest";
import { vi } from "vitest";

afterEach(() => {
  cleanup();
});

// Strip Next.js Image-only props so the DOM <img> mock does not trigger React warnings.
const NEXT_IMAGE_NON_DOM_PROPS = new Set([
  "blurDataURL",
  "fill",
  "loader",
  "placeholder",
  "priority",
  "quality",
  "unoptimized",
]);

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const imgProps: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(props)) {
      if (!NEXT_IMAGE_NON_DOM_PROPS.has(key)) {
        imgProps[key] = value;
      }
    }
    return createElement("img", { ...imgProps, alt: props.alt ?? "" });
  },
}));
