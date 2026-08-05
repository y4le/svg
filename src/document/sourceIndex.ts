import { xmlLanguage } from "@codemirror/lang-xml";
import type { SyntaxNode } from "@lezer/common";
import type { SourceVersion } from "./source";

export interface SourceRange {
  readonly from: number;
  readonly to: number;
}

export interface SourceAttribute {
  readonly name: string;
  readonly nameRange: SourceRange;
  readonly value: string | null;
  readonly valueRange: SourceRange | null;
}

export interface SourceElement {
  readonly id: number;
  readonly name: string;
  readonly range: SourceRange;
  readonly openTagRange: SourceRange;
  readonly tagNameRange: SourceRange;
  readonly attributes: ReadonlyMap<string, SourceAttribute>;
  readonly parentId: number | null;
}

function range(node: SyntaxNode): SourceRange {
  return { from: node.from, to: node.to };
}

function readAttribute(
  source: string,
  node: SyntaxNode,
): SourceAttribute | null {
  const nameNode = node.getChild("AttributeName");
  if (!nameNode) return null;
  const valueNode = node.getChild("AttributeValue");
  const rawValue = valueNode
    ? source.slice(valueNode.from, valueNode.to)
    : null;
  const quoted = rawValue?.match(/^(["'])([\s\S]*)\1$/);
  return {
    name: source.slice(nameNode.from, nameNode.to),
    nameRange: range(nameNode),
    value: quoted ? (quoted[2] ?? "") : rawValue,
    valueRange: valueNode
      ? quoted
        ? { from: valueNode.from + 1, to: valueNode.to - 1 }
        : range(valueNode)
      : null,
  };
}

export class SourceIndex {
  readonly source: string;
  readonly version: SourceVersion;
  readonly elements: readonly SourceElement[];
  readonly #byId: ReadonlyMap<number, SourceElement>;

  constructor(source: string, version: SourceVersion) {
    this.source = source;
    this.version = version;
    const provisional: Array<Omit<SourceElement, "parentId">> = [];
    xmlLanguage.parser.parse(source).iterate({
      enter: (node) => {
        if (node.name !== "Element") return;
        const openTag =
          node.node.getChild("OpenTag") ?? node.node.getChild("SelfClosingTag");
        const tagName = openTag?.getChild("TagName");
        if (!openTag || !tagName) return;
        const attributes = new Map<string, SourceAttribute>();
        for (const attributeNode of openTag.getChildren("Attribute")) {
          const attribute = readAttribute(source, attributeNode);
          if (attribute) attributes.set(attribute.name, attribute);
        }
        provisional.push({
          id: provisional.length,
          name: source.slice(tagName.from, tagName.to),
          range: range(node.node),
          openTagRange: range(openTag),
          tagNameRange: range(tagName),
          attributes,
        });
      },
    });

    const stack: SourceElement[] = [];
    const elements: SourceElement[] = [];
    for (const item of provisional) {
      while (stack.length && item.range.from >= stack.at(-1)!.range.to)
        stack.pop();
      const element: SourceElement = {
        ...item,
        parentId: stack.at(-1)?.id ?? null,
      };
      elements.push(element);
      stack.push(element);
    }
    this.elements = elements;
    this.#byId = new Map(elements.map((element) => [element.id, element]));
  }

  element(id: number): SourceElement | null {
    return this.#byId.get(id) ?? null;
  }

  parent(element: SourceElement): SourceElement | null {
    return element.parentId === null ? null : this.element(element.parentId);
  }

  deepestAt(position: number): SourceElement | null {
    let match: SourceElement | null = null;
    for (const element of this.elements) {
      if (element.range.from <= position && position <= element.range.to)
        match = element;
      if (element.range.from > position) break;
    }
    return match;
  }

  ancestors(element: SourceElement): SourceElement[] {
    const result: SourceElement[] = [element];
    let parent = this.parent(element);
    while (parent) {
      result.unshift(parent);
      parent = this.parent(parent);
    }
    return result;
  }
}

export interface PreviewAlignment {
  readonly byElement: WeakMap<Element, SourceElement>;
  readonly byId: ReadonlyMap<number, Element>;
  readonly complete: boolean;
}

export function alignPreviewElements(
  index: SourceIndex,
  root: Element,
): PreviewAlignment {
  const previewElements = [root, ...root.querySelectorAll("*")];
  const byElement = new WeakMap<Element, SourceElement>();
  const byId = new Map<number, Element>();
  let complete = previewElements.length === index.elements.length;

  for (
    let position = 0;
    position < Math.min(previewElements.length, index.elements.length);
    position += 1
  ) {
    const previewElement = previewElements[position]!;
    const sourceElement = index.elements[position]!;
    const sourceLocalName = sourceElement.name.split(":").at(-1)?.toLowerCase();
    if (previewElement.localName.toLowerCase() !== sourceLocalName) {
      complete = false;
      continue;
    }
    byElement.set(previewElement, sourceElement);
    byId.set(sourceElement.id, previewElement);
  }
  return { byElement, byId, complete };
}
