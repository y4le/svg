import { describe, expect, it } from "vitest";
import { normalizeSvgFilename } from "./filename";

describe("normalizeSvgFilename", () => {
  it("trims a filename and supplies the SVG extension", () => {
    expect(normalizeSvgFilename("  orbit-pulse  ")).toBe("orbit-pulse.svg");
    expect(normalizeSvgFilename("drawing.SVG")).toBe("drawing.SVG");
  });

  it.each(["", "   ", ".", "..", ".svg", "a/b", "a\\b", "CON.svg"])(
    "rejects the invalid leaf filename %j",
    (filename) => {
      expect(normalizeSvgFilename(filename)).toBeNull();
    },
  );
});
