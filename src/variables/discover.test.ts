import { describe, expect, it } from "vitest";
import { sourceVersion } from "../document/source";
import { SourceIndex } from "../document/sourceIndex";
import {
  discoverRootVariables,
  parseControlDirective,
  parseNumericLiteral,
} from "./discover";

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

  it("carries the source version with each exact variable range", () => {
    const source =
      '<svg xmlns="http://www.w3.org/2000/svg" style="--radius: 9px"><circle r="var(--radius)" /></svg>';
    const index = new SourceIndex(source, sourceVersion(12));
    const parsedDocument = {
      documentElement: { childNodes: [] },
    } as unknown as XMLDocument;
    const [variable] = discoverRootVariables(index, parsedDocument);
    expect(variable).toBeDefined();
    expect(variable!.version).toBe(12);
    expect(
      source.slice(variable!.valueRange.from, variable!.valueRange.to),
    ).toBe("9px");
  });
});
