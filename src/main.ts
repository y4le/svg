import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "./styles.css";
import { h } from "./ui/dom";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing #app mount point");
}

const filename = h(
  "div",
  { className: "file-state" },
  h("span", { className: "wordmark" }, "svg"),
  h("span", { className: "filename" }, "untitled.svg"),
  h("span", { className: "status status-muted" }, "empty"),
);

const playback = h(
  "div",
  { className: "rail-actions", "aria-label": "Playback and file actions" },
  h("button", { type: "button", disabled: true }, "pause"),
  h("button", { type: "button", disabled: true }, "restart"),
  h("button", { type: "button", disabled: true }, "inspect"),
  h("span", { className: "rail-separator", "aria-hidden": "true" }),
  h("button", { type: "button", disabled: true }, "open"),
  h("button", { type: "button", disabled: true }, "download"),
);

const sourcePane = h(
  "section",
  { className: "pane source-pane", "aria-labelledby": "source-title" },
  h(
    "header",
    { className: "pane-header" },
    h("h1", { id: "source-title" }, "source"),
    h("span", { className: "pane-meta" }, "XML"),
  ),
  h(
    "div",
    { className: "empty-state" },
    h("p", {}, "Type or open an SVG here."),
    h("p", { className: "quiet" }, "The source stays authoritative."),
  ),
);

const previewPane = h(
  "section",
  { className: "pane preview-pane", "aria-labelledby": "preview-title" },
  h(
    "header",
    { className: "pane-header" },
    h("h1", { id: "preview-title" }, "preview"),
    h("span", { className: "pane-meta" }, "scripts disabled"),
  ),
  h(
    "div",
    { className: "preview-stage" },
    h(
      "div",
      { className: "empty-state" },
      h("p", {}, "Rendered SVG appears here."),
      h("p", { className: "quiet" }, "Animation controls stay visible."),
    ),
  ),
);

const variableRail = h(
  "footer",
  { className: "instrument-rail" },
  h(
    "div",
    { className: "breadcrumb", "aria-label": "Selection path" },
    "no selection",
  ),
  h(
    "div",
    { className: "rail-note" },
    "variables appear from root CSS custom properties",
  ),
);

app.replaceChildren(
  h(
    "div",
    { className: "app-shell" },
    h("header", { className: "top-rail" }, filename, playback),
    h("main", { className: "workbench" }, sourcePane, previewPane),
    variableRail,
    h("div", {
      className: "sr-only",
      "aria-live": "polite",
      id: "live-region",
    }),
  ),
);
