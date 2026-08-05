import type { SourceRange } from "../document/sourceIndex";
import type { SourceIndex } from "../document/sourceIndex";

export interface ControlDirective {
  readonly name: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly unit?: string;
}

export interface NumericLiteral {
  readonly value: number;
  readonly unit: string;
}

export interface SourceVariable {
  readonly name: string;
  readonly label: string;
  readonly value: string;
  readonly valueRange: SourceRange;
  readonly numeric: NumericLiteral | null;
  readonly directive: ControlDirective | null;
  readonly usageCount: number;
}

export function parseControlDirective(text: string): ControlDirective | null {
  const match = /^\s*@control\s+([A-Za-z_][\w-]*)(?:\s+|$)(.*)$/i.exec(text);
  if (!match) return null;
  const fields = new Map<string, string>();
  for (const token of (match[2] ?? "").trim().split(/\s+/)) {
    const field = /^([a-z]+)=(.+)$/i.exec(token);
    if (field?.[1] && field[2]) fields.set(field[1].toLowerCase(), field[2]);
  }
  const min = Number(fields.get("min"));
  const max = Number(fields.get("max"));
  const step = Number(fields.get("step"));
  if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(step))
    return null;
  if (min >= max || step <= 0) return null;
  const unit = fields.get("unit");
  return {
    name: `--${match[1]}`,
    min,
    max,
    step,
    ...(unit ? { unit } : {}),
  };
}

export function parseNumericLiteral(value: string): NumericLiteral | null {
  const match = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)([a-z%]*)$/i.exec(
    value.trim(),
  );
  if (!match?.[1]) return null;
  const number = Number(match[1]);
  return Number.isFinite(number)
    ? { value: number, unit: match[2] ?? "" }
    : null;
}

export function discoverRootVariables(
  index: SourceIndex,
  parsedDocument: XMLDocument,
): SourceVariable[] {
  const root = index.elements[0];
  const style = root?.attributes.get("style");
  if (!style?.valueRange) return [];

  const directives = new Map<string, ControlDirective>();
  for (const child of parsedDocument.documentElement.childNodes) {
    if (child.nodeType !== 8) continue;
    const directive = parseControlDirective(child.nodeValue ?? "");
    if (directive) directives.set(directive.name, directive);
  }

  const styleSource = index.source.slice(
    style.valueRange.from,
    style.valueRange.to,
  );
  const variables: SourceVariable[] = [];
  for (const match of styleSource.matchAll(
    /(--[A-Za-z_][\w-]*)\s*:\s*([^;]*)/g,
  )) {
    if (match.index === undefined || !match[1] || match[2] === undefined)
      continue;
    const rawValue = match[2];
    const leading = rawValue.length - rawValue.trimStart().length;
    const trimmed = rawValue.trim();
    if (!trimmed) continue;
    const valueOffset = match[0].lastIndexOf(rawValue) + leading;
    const from = style.valueRange.from + match.index + valueOffset;
    const numeric = parseNumericLiteral(trimmed);
    const directive = directives.get(match[1]) ?? null;
    const escapedName = match[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const usageCount = Math.max(
      0,
      [
        ...index.source.matchAll(
          new RegExp(`var\\(\\s*${escapedName}\\s*\\)`, "g"),
        ),
      ].length,
    );
    variables.push({
      name: match[1],
      label: match[1].slice(2).replace(/-/g, " "),
      value: trimmed,
      valueRange: { from, to: from + trimmed.length },
      numeric,
      directive:
        directive &&
        numeric &&
        (!directive.unit || directive.unit === numeric.unit)
          ? directive
          : null,
      usageCount,
    });
  }
  return variables;
}
