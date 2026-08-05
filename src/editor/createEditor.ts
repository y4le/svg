import { indentWithTab } from "@codemirror/commands";
import { xml } from "@codemirror/lang-xml";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { basicSetup } from "codemirror";

interface EditorOptions {
  readonly parent: HTMLElement;
  readonly document: string;
  readonly onChange: (source: string) => void;
  readonly onSelectionChange?: (position: number) => void;
}

const workbenchTheme = EditorView.theme(
  {
    "&": {
      height: "100%",
      color: "#e8e3d5",
      backgroundColor: "#0e0e0d",
      fontSize: "13px",
    },
    ".cm-scroller": {
      fontFamily: '"Geist Mono Variable", "Geist Mono", monospace',
      lineHeight: "1.62",
      overflow: "auto",
    },
    ".cm-content": { padding: "12px 0 48px" },
    ".cm-gutters": {
      backgroundColor: "#0e0e0d",
      color: "#54524c",
      border: "0",
      paddingLeft: "4px",
    },
    ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "#151411" },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
      backgroundColor: "#34312a !important",
    },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#c1432e" },
    ".cm-focused": { outline: "none" },
  },
  { dark: true },
);

export function createEditor(options: EditorOptions): EditorView {
  return new EditorView({
    parent: options.parent,
    state: EditorState.create({
      doc: options.document,
      extensions: [
        basicSetup,
        xml(),
        EditorState.tabSize.of(2),
        EditorView.lineWrapping,
        keymap.of([indentWithTab]),
        workbenchTheme,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) options.onChange(update.state.doc.toString());
          if (update.selectionSet || update.docChanged) {
            options.onSelectionChange?.(update.state.selection.main.head);
          }
        }),
      ],
    }),
  });
}
