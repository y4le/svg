import { describe, expect, it } from "vitest";
import {
  countBlockedCssReferences,
  isEmbeddedReference,
  neutralizeCssReferences,
} from "./previewPolicy";

describe("preview resource policy", () => {
  it.each(["#paint", "data:image/svg+xml,<svg/>", "blob:local", ""])(
    "keeps embedded reference %s",
    (reference) => expect(isEmbeddedReference(reference)).toBe(true),
  );

  it.each([
    "asset.svg",
    "/asset.svg",
    "//cdn.test/a.svg",
    "https://cdn.test/a.svg",
  ])("blocks resource reference %s", (reference) =>
    expect(isEmbeddedReference(reference)).toBe(false),
  );

  it("counts each import once and accepts valid no-whitespace syntax", () => {
    expect(
      countBlockedCssReferences(
        '@import"https://cdn.test/a.css"; .x { mask: url("https://cdn.test/m.svg") }',
      ),
    ).toBe(2);
  });

  it("removes imports and neutralizes resource URLs without touching fragments", () => {
    expect(
      neutralizeCssReferences(
        '@import url("theme.css"); .x { fill: url(#paint); mask: url(mask.svg) }',
      ),
    ).toBe(
      ' .x { fill: url(#paint); mask: url("#__svg_workbench_blocked__") }',
    );
  });
});
