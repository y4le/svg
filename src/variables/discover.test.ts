import { describe, expect, it } from "vitest";
import { parseControlDirective, parseNumericLiteral } from "./discover";

describe("variable discovery", () => {
  it("parses XML-safe bounded control directives", () => {
    expect(
      parseControlDirective(" @control radius min=8 max=80 step=0.5 unit=px "),
    ).toEqual({
      name: "--radius",
      min: 8,
      max: 80,
      step: 0.5,
      unit: "px",
    });
  });

  it.each([
    "@control --radius min=1 max=2 step=1",
    "@control x min=2 max=1 step=1",
  ])("rejects invalid directive %s", (source) =>
    expect(parseControlDirective(source)).toBeNull(),
  );

  it("separates numeric values and units", () => {
    expect(parseNumericLiteral("-1.25e2ms")).toEqual({
      value: -125,
      unit: "ms",
    });
    expect(parseNumericLiteral("#c1432e")).toBeNull();
  });
});
