import { describe, expect, it } from "vitest";
import { readDemoShortname, withDemoShortname } from "./demoUrl";

describe("demo URL", () => {
  it("reads the first exact query value", () => {
    expect(readDemoShortname("?demo=card&demo=other")).toBe("card");
    expect(readDemoShortname("?demo=Card%20One")).toBe("Card One");
    expect(readDemoShortname("?demo=")).toBe("");
    expect(readDemoShortname("?other=card")).toBeNull();
  });

  it("updates only the demo parameter", () => {
    const original = new URL("https://yalethom.as/svg/?mode=dark#source");
    expect(withDemoShortname(original, "card").href).toBe(
      "https://yalethom.as/svg/?mode=dark&demo=card#source",
    );
    expect(
      withDemoShortname(withDemoShortname(original, "card"), null).href,
    ).toBe(original.href);
  });
});
