import { describe, expect, it } from "vitest";

describe("project scaffold", () => {
  it("runs the unit-test toolchain", () => {
    expect("svg").toHaveLength(3);
  });
});
