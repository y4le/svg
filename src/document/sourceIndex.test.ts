import { describe, expect, it } from "vitest";
import { sourceVersion } from "./source";
import { SourceIndex } from "./sourceIndex";

const SOURCE = `<svg xmlns="http://www.w3.org/2000/svg">
  <g id='group'>
    <circle cx="4" />
    <text>hello</text>
  </g>
</svg>`;

describe("SourceIndex", () => {
  it("indexes element, opening-tag, and exact attribute value ranges", () => {
    const index = new SourceIndex(SOURCE, sourceVersion(3));
    expect(index.elements.map((element) => element.name)).toEqual([
      "svg",
      "g",
      "circle",
      "text",
    ]);
    const group = index.elements[1]!;
    expect(group.parentId).toBe(0);
    expect(SOURCE.slice(group.openTagRange.from, group.openTagRange.to)).toBe(
      "<g id='group'>",
    );
    const id = group.attributes.get("id")!;
    expect(id.value).toBe("group");
    expect(SOURCE.slice(id.valueRange!.from, id.valueRange!.to)).toBe("group");
  });

  it("returns the deepest authored owner for text and tags", () => {
    const index = new SourceIndex(SOURCE, sourceVersion(1));
    expect(index.deepestAt(SOURCE.indexOf("hello"))?.name).toBe("text");
    expect(index.deepestAt(SOURCE.indexOf("circle"))?.name).toBe("circle");
    expect(
      index.ancestors(index.elements[2]!).map((element) => element.name),
    ).toEqual(["svg", "g", "circle"]);
  });
});
