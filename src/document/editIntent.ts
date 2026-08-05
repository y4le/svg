import { isolateHistory } from "@codemirror/commands";
import { Transaction } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import type { SourceVersion } from "./source";
import type { SourceRange } from "./sourceIndex";

export interface EditIntent {
  readonly version: SourceVersion;
  readonly range: SourceRange;
  readonly insert: string;
}

export function replaceIntent(
  version: SourceVersion,
  range: SourceRange,
  insert: string,
): EditIntent {
  return { version, range, insert };
}

export function applyEditIntent(
  view: EditorView,
  currentVersion: SourceVersion,
  intent: EditIntent,
  options: { addToHistory?: boolean; isolate?: boolean } = {},
): boolean {
  if (intent.version !== currentVersion) return false;
  const annotations = [];
  if (options.addToHistory === false)
    annotations.push(Transaction.addToHistory.of(false));
  if (options.isolate) annotations.push(isolateHistory.of("full"));
  view.dispatch({
    changes: {
      from: intent.range.from,
      to: intent.range.to,
      insert: intent.insert,
    },
    selection: {
      anchor: intent.range.from,
      head: intent.range.from + intent.insert.length,
    },
    annotations,
  });
  return true;
}

export function numericPrecision(step: number): number {
  if (!Number.isFinite(step) || step <= 0) return 4;
  const text = step.toString().toLowerCase();
  if (text.includes("e-")) return Math.min(8, Number(text.split("e-")[1]));
  return Math.min(8, text.split(".")[1]?.length ?? 0);
}

export function formatSteppedNumber(value: number, step: number): string {
  const precision = numericPrecision(step);
  const factor = 10 ** precision;
  const rounded = Math.round((value + Number.EPSILON) * factor) / factor;
  const fixed = rounded.toFixed(precision);
  return fixed.includes(".")
    ? fixed.replace(/0+$/, "").replace(/\.$/, "")
    : fixed;
}
