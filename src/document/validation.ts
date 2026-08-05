import {
  countBlockedCssReferences,
  isEmbeddedReference,
} from "../security/previewPolicy";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

export type DiagnosticCode =
  "doctype-disabled" | "invalid-xml" | "not-svg" | "missing-svg-namespace";

export interface SourceDiagnostic {
  readonly code: DiagnosticCode;
  readonly message: string;
  readonly line?: number;
  readonly column?: number;
}

export interface DisabledCapabilities {
  readonly scripts: number;
  readonly eventHandlers: number;
  readonly externalReferences: number;
  readonly navigation: number;
  readonly embeddedDocuments: number;
}

export interface ValidSvg {
  readonly ok: true;
  readonly document: XMLDocument;
  readonly disabled: DisabledCapabilities;
}

export interface InvalidSvg {
  readonly ok: false;
  readonly diagnostic: SourceDiagnostic;
}

export type ValidationResult = ValidSvg | InvalidSvg;

function parserLocation(
  message: string,
): Pick<SourceDiagnostic, "line" | "column"> {
  const line = /line(?:\s+number)?\s*[:=]?\s*(\d+)/i.exec(message)?.[1];
  const column = /column\s*[:=]?\s*(\d+)/i.exec(message)?.[1];
  return {
    ...(line ? { line: Number(line) } : {}),
    ...(column ? { column: Number(column) } : {}),
  };
}

function countDisabledCapabilities(root: Element): DisabledCapabilities {
  let eventHandlers = 0;
  let externalReferences = 0;
  let navigation = 0;
  let embeddedDocuments = 0;

  for (const element of [root, ...root.querySelectorAll("*")]) {
    for (const attribute of element.attributes) {
      const attributeName = attribute.name.toLowerCase();
      const localName = element.localName.toLowerCase();
      if (attribute.name.toLowerCase().startsWith("on")) eventHandlers += 1;
      if (attribute.localName === "href" && localName === "a") {
        navigation += 1;
      }
      if (attributeName === "action" || attributeName === "formaction") {
        navigation += 1;
      }
      if (
        (attribute.localName === "href" || attribute.name === "src") &&
        !isEmbeddedReference(attribute.value)
      ) {
        externalReferences += 1;
      }
      if (
        attributeName === "srcset" ||
        attributeName === "poster" ||
        (attributeName === "data" && localName === "object") ||
        ((attributeName === "action" || attributeName === "formaction") &&
          !isEmbeddedReference(attribute.value))
      ) {
        externalReferences += 1;
      }
      if (attributeName === "style")
        externalReferences += countBlockedCssReferences(attribute.value);
    }
    if (
      ["iframe", "object", "embed"].includes(element.localName.toLowerCase())
    ) {
      embeddedDocuments += 1;
    }
  }

  for (const style of root.querySelectorAll("style")) {
    externalReferences += countBlockedCssReferences(style.textContent ?? "");
  }

  return {
    scripts: root.querySelectorAll("script").length,
    eventHandlers,
    externalReferences,
    navigation,
    embeddedDocuments,
  };
}

function hasDoctypeInProlog(source: string): boolean {
  let position = source.charCodeAt(0) === 0xfeff ? 1 : 0;
  while (position < source.length) {
    const rest = source.slice(position);
    const whitespace = /^\s+/.exec(rest)?.[0];
    if (whitespace) {
      position += whitespace.length;
      continue;
    }
    if (rest.startsWith("<!--")) {
      const end = source.indexOf("-->", position + 4);
      if (end < 0) return false;
      position = end + 3;
      continue;
    }
    if (rest.startsWith("<?")) {
      const end = source.indexOf("?>", position + 2);
      if (end < 0) return false;
      position = end + 2;
      continue;
    }
    return /^<!DOCTYPE\b/i.test(rest);
  }
  return false;
}

function cleanParserMessage(message: string): string {
  const normalized = message.replace(/\s+/g, " ").trim();
  const browserDetail =
    /error on line \d+ at column \d+:\s*(.*?)(?: Below is|$)/i.exec(
      normalized,
    )?.[1];
  if (browserDetail) return browserDetail.trim();
  return normalized
    .replace(/^This page contains the following errors?:?\s*/i, "")
    .replace(/^XML Parsing Error:\s*/i, "")
    .replace(/\s+Location:.*$/i, "")
    .replace(/Below is a rendering of the page up to the first error\.?$/i, "")
    .trim();
}

export function validateSvg(source: string): ValidationResult {
  if (hasDoctypeInProlog(source)) {
    return {
      ok: false,
      diagnostic: {
        code: "doctype-disabled",
        message: "DOCTYPE declarations are disabled in the preview.",
      },
    };
  }

  const documentNode = new DOMParser().parseFromString(source, "image/svg+xml");
  const parserError =
    documentNode.documentElement.localName === "parsererror"
      ? documentNode.documentElement
      : documentNode.getElementsByTagName("parsererror")[0];

  if (parserError) {
    const rawMessage =
      parserError.textContent?.trim() || "The SVG is not valid XML.";
    return {
      ok: false,
      diagnostic: {
        code: "invalid-xml",
        message: cleanParserMessage(rawMessage),
        ...parserLocation(rawMessage),
      },
    };
  }

  const root = documentNode.documentElement;
  if (root.localName !== "svg") {
    return {
      ok: false,
      diagnostic: {
        code: "not-svg",
        message: "The document root must be an <svg> element.",
      },
    };
  }

  if (root.namespaceURI !== SVG_NAMESPACE) {
    return {
      ok: false,
      diagnostic: {
        code: "missing-svg-namespace",
        message: 'The root needs xmlns="http://www.w3.org/2000/svg".',
      },
    };
  }

  return {
    ok: true,
    document: documentNode,
    disabled: countDisabledCapabilities(root),
  };
}

export function formatDiagnostic(diagnostic: SourceDiagnostic): string {
  const location = diagnostic.line
    ? `line ${diagnostic.line}${diagnostic.column ? `:${diagnostic.column}` : ""} · `
    : "";
  return `${location}${diagnostic.message}`;
}
