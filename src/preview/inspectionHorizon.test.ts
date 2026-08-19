import { describe, expect, test } from "vitest";
import {
  inspectionHorizonLabel,
  parseSmilBegin,
  parseSmilClockValue,
  resolveInspectionHorizon,
  smilCandidate,
  webAnimationCandidate,
  type SmilTiming,
} from "./inspectionHorizon";

function smil(overrides: Partial<SmilTiming> = {}): SmilTiming {
  return {
    begin: null,
    dur: "2s",
    repeatCount: null,
    repeatDur: null,
    ...overrides,
  };
}

describe("SMIL clock parsing", () => {
  test.each([
    ["2s", 2],
    ["500ms", 0.5],
    ["2", 2],
    ["1min", 60],
    ["1.5h", 5400],
    ["00:03", 3],
    ["01:02:03.5", 3723.5],
  ])("parses %s as %s seconds", (value, seconds) => {
    expect(parseSmilClockValue(value)).toBe(seconds);
  });

  test.each(["", "indefinite", "media", "click", "wallclock(now)", "-1s"])(
    "does not guess %s",
    (value) => expect(parseSmilClockValue(value)).toBeNull(),
  );

  test("accepts only lists of plain begin offsets", () => {
    expect(parseSmilBegin(null)).toBe(0);
    expect(parseSmilBegin("2s; 5s")).toBe(5);
    expect(parseSmilBegin("-1s")).toBe(0);
    expect(parseSmilBegin("2s; click")).toBeNull();
    expect(parseSmilBegin("orbit.end+1s")).toBeNull();
  });
});

describe("inspection horizon candidates", () => {
  test("uses finite CSS end times and one cycle of infinite CSS animation", () => {
    expect(
      webAnimationCandidate({ delay: 0, duration: 4000, endTime: 12_000 }),
    ).toEqual({ seconds: 12, source: "css-finite" });
    expect(
      webAnimationCandidate({
        delay: 1000,
        duration: 4000,
        endTime: Infinity,
      }),
    ).toEqual({ seconds: 5, source: "css-iteration" });
    expect(
      webAnimationCandidate({
        delay: -1000,
        duration: 4000,
        endTime: Infinity,
      }),
    ).toEqual({ seconds: 4, source: "css-iteration" });
    expect(
      webAnimationCandidate({
        delay: 0,
        duration: "auto",
        endTime: Infinity,
      }),
    ).toBeNull();
  });

  test("includes supported SMIL begins and repeats", () => {
    expect(smilCandidate(smil())).toEqual({
      seconds: 2,
      source: "smil-finite",
    });
    expect(smilCandidate(smil({ begin: "1s", repeatCount: "3" }))).toEqual({
      seconds: 7,
      source: "smil-finite",
    });
    expect(smilCandidate(smil({ repeatCount: "indefinite" }))).toEqual({
      seconds: 2,
      source: "smil-iteration",
    });
    expect(smilCandidate(smil({ repeatCount: "10", repeatDur: "5s" }))).toEqual(
      { seconds: 5, source: "smil-finite" },
    );
    expect(smilCandidate(smil({ repeatDur: "10s" }))).toEqual({
      seconds: 10,
      source: "smil-finite",
    });
    expect(smilCandidate(smil({ begin: "click" }))).toBeNull();
    expect(smilCandidate(smil({ dur: "indefinite" }))).toBeNull();
    expect(smilCandidate(smil({ repeatCount: "0x10" }))).toBeNull();
  });
});

describe("inspection horizon resolution", () => {
  test("selects and labels the longest timing on the shared time axis", () => {
    const horizon = resolveInspectionHorizon(
      [
        { seconds: 4, source: "css-iteration" },
        { seconds: 2, source: "smil-iteration" },
      ],
      0,
    );
    expect(horizon).toEqual({
      seconds: 4,
      source: "css-iteration",
      unresolvedTimings: 0,
      fallback: null,
    });
    expect(inspectionHorizonLabel(horizon)).toBe(
      "horizon 4.00s · longest CSS iteration",
    );
  });

  test("retains an honest fallback for static and unresolved documents", () => {
    expect(inspectionHorizonLabel(resolveInspectionHorizon([], 0))).toBe(
      "horizon 10s · no animation timing",
    );
    expect(inspectionHorizonLabel(resolveInspectionHorizon([], 2))).toBe(
      "horizon 10s · indefinite or event-driven timing",
    );
    expect(
      inspectionHorizonLabel(
        resolveInspectionHorizon([{ seconds: 0, source: "smil-finite" }], 0),
      ),
    ).toBe("horizon 10s · zero-length animation timing");
  });

  test("rounds upward without imposing a maximum", () => {
    expect(
      resolveInspectionHorizon(
        [{ seconds: 3.999_000_1, source: "smil-finite" }],
        1,
      ),
    ).toEqual({
      seconds: 4,
      source: "smil-finite",
      unresolvedTimings: 1,
      fallback: null,
    });
    expect(
      inspectionHorizonLabel({
        seconds: 3600,
        source: "smil-finite",
        unresolvedTimings: 1,
        fallback: null,
      }),
    ).toBe("horizon 3600.00s · longest SMIL timing · 1 timing unresolved");
  });
});
