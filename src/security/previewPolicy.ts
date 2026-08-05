export function isEmbeddedReference(value: string): boolean {
  const reference = value.trim();
  return (
    reference === "" ||
    reference.startsWith("#") ||
    /^data:image\//i.test(reference) ||
    reference.startsWith("blob:")
  );
}

const IMPORT_PATTERN = /@import\s*(?:url\([^)]*\)|["'][^"']*["'])[^;]*;?/gi;
const URL_PATTERN = /url\(\s*(["']?)(.*?)\1\s*\)/gi;

export function countBlockedCssReferences(css: string): number {
  const imports = css.match(IMPORT_PATTERN)?.length ?? 0;
  const withoutImports = css.replace(IMPORT_PATTERN, "");
  let urls = 0;
  for (const match of withoutImports.matchAll(URL_PATTERN)) {
    if (!isEmbeddedReference(match[2] ?? "")) urls += 1;
  }
  return imports + urls;
}

export function neutralizeCssReferences(css: string): string {
  return css
    .replace(IMPORT_PATTERN, "")
    .replace(URL_PATTERN, (match, _quote: string, value: string) =>
      isEmbeddedReference(value) ? match : 'url("#__svg_workbench_blocked__")',
    );
}

export function hardenImportedSvg(root: Element): void {
  for (const element of [root, ...root.querySelectorAll("*")]) {
    const localName = element.localName.toLowerCase();
    if (localName === "script") {
      element.replaceChildren();
      element.setAttribute("type", "application/x-svg-workbench-disabled");
    }

    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      if (name.startsWith("on")) {
        element.removeAttributeNode(attribute);
        continue;
      }

      if (attribute.localName === "href" || name === "src") {
        if (localName === "a") {
          element.setAttribute("data-svg-workbench-blocked-link", "");
          element.removeAttributeNode(attribute);
        } else if (!isEmbeddedReference(attribute.value)) {
          element.removeAttributeNode(attribute);
        }
        continue;
      }

      if (name === "srcset" || name === "srcdoc") {
        element.removeAttributeNode(attribute);
        continue;
      }

      if (
        name === "action" ||
        name === "formaction" ||
        name === "poster" ||
        (name === "data" && localName === "object")
      ) {
        if (
          name === "action" ||
          name === "formaction" ||
          !isEmbeddedReference(attribute.value)
        ) {
          element.removeAttributeNode(attribute);
        }
        continue;
      }

      if (name === "style") {
        attribute.value = neutralizeCssReferences(attribute.value);
      }
    }

    if (localName === "style" && element.textContent) {
      element.textContent = neutralizeCssReferences(element.textContent);
    }
  }
}
