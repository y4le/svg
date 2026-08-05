import type { EditorView } from "@codemirror/view";
import { describe, expect, it, vi } from "vitest";
import {
  applyEditIntent,
  formatSteppedNumber,
  numericPrecision,
  replaceIntent,
} from "./editIntent";
import { sourceVersion } from "./source";

describe("EditIntent", () => {
  it("retains the source version and exact replacement span", () => {
    expect(
      replaceIntent(sourceVersion(4), { from: 9, to: 13 }, "2.5s"),
    ).toEqual({
      version: 4,
      range: { from: 9, to: 13 },
      insert: "2.5s",
    });
  });

  it.each([
    [0.25, 2],
    [1, 0],
    [0.001, 3],
  ])("derives %s precision as %s", (step, precision) => {
    expect(numericPrecision(step)).toBe(precision);
  });

  it("formats stepped values without floating-point residue", () => {
    expect(formatSteppedNumber(0.1 + 0.2, 0.1)).toBe("0.3");
    expect(formatSteppedNumber(4.5, 0.25)).toBe("4.5");
  });

  it("refuses a stale source version without dispatching", () => {
    const dispatch = vi.fn();
    const view = { dispatch } as unknown as EditorView;
    const applied = applyEditIntent(
      view,
      sourceVersion(8),
      replaceIntent(sourceVersion(7), { from: 1, to: 2 }, "x"),
    );
    expect(applied).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
