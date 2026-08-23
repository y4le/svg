import type { DemoEntry } from "../demos/manifest";
import { githubBlobUrl } from "../demos/registry";
import { h } from "./dom";

export class DemoMenu {
  readonly dialog: HTMLDialogElement;
  readonly #buttons = new Map<string, HTMLButtonElement>();
  readonly #onSelect: (entry: DemoEntry) => void;
  #invoker: HTMLElement | null = null;

  constructor(
    entries: readonly DemoEntry[],
    onSelect: (entry: DemoEntry) => void,
  ) {
    this.#onSelect = onSelect;
    const list = h("ul", { className: "demo-list" });
    for (const entry of entries) {
      const button = h(
        "button",
        {
          type: "button",
          className: "demo-entry",
          onclick: () => {
            this.close();
            this.#onSelect(entry);
          },
        },
        h("span", { className: "demo-entry-shortname" }, entry.shortname),
        h("strong", { className: "demo-entry-title" }, entry.title),
        h("span", { className: "demo-entry-summary" }, entry.summary),
        h(
          "span",
          { className: "demo-entry-path" },
          `${entry.owner}/${entry.repository} · ${entry.path}`,
        ),
        entry.party === "third-party"
          ? h(
              "span",
              { className: "demo-entry-attribution" },
              `${entry.attribution} · ${entry.license}`,
            )
          : null,
      );
      this.#buttons.set(entry.shortname, button);
      list.append(
        h(
          "li",
          {},
          button,
          h(
            "a",
            {
              className: "demo-source-link",
              href: githubBlobUrl(entry),
              target: "_blank",
              rel: "noreferrer",
            },
            "view source on GitHub",
          ),
        ),
      );
    }

    this.dialog = h(
      "dialog",
      {
        className: "demo-dialog",
        "aria-labelledby": "demo-dialog-title",
        onclose: () => {
          const invoker = this.#invoker;
          this.#invoker = null;
          invoker?.focus();
        },
      },
      h(
        "header",
        { className: "demo-dialog-header" },
        h("h2", { id: "demo-dialog-title" }, "demos"),
        h("span", { className: "demo-shortcut" }, "Shift+D"),
        h(
          "button",
          {
            type: "button",
            className: "demo-close",
            "aria-label": "Close demos",
            onclick: () => this.close(),
          },
          "close",
        ),
      ),
      list,
    );
  }

  get open(): boolean {
    return this.dialog.open;
  }

  show(invoker: HTMLElement): void {
    if (this.dialog.open) return;
    this.#invoker = invoker;
    this.dialog.showModal();
    this.#buttons.values().next().value?.focus();
  }

  close(): void {
    if (this.dialog.open) this.dialog.close();
  }

  setCurrent(shortname: string | null): void {
    for (const [name, button] of this.#buttons) {
      if (name === shortname) button.setAttribute("aria-current", "true");
      else button.removeAttribute("aria-current");
    }
  }

  destroy(): void {
    this.close();
    this.dialog.remove();
  }
}
