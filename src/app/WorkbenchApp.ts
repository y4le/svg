import { EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { sourceVersion } from "../document/source";
import {
  alignPreviewElements,
  SourceIndex,
  type PreviewAlignment,
  type SourceElement,
} from "../document/sourceIndex";
import {
  validateSvg,
  formatDiagnostic,
  type ValidSvg,
} from "../document/validation";
import { createEditor } from "../editor/createEditor";
import { DEFAULT_SVG } from "../examples/default";
import {
  PreviewSession,
  type AnimationFamily,
  type PlaybackState,
} from "../preview/PreviewSession";
import { h } from "../ui/dom";

const PREVIEW_DELAY = 140;

function disabledSummary(validation: ValidSvg): string {
  const {
    scripts,
    eventHandlers,
    externalReferences,
    navigation,
    embeddedDocuments,
  } = validation.disabled;
  const parts = [
    scripts ? `${scripts} script${scripts === 1 ? "" : "s"}` : "",
    eventHandlers
      ? `${eventHandlers} handler${eventHandlers === 1 ? "" : "s"}`
      : "",
    externalReferences
      ? `${externalReferences} resource reference${externalReferences === 1 ? "" : "s"}`
      : "",
    navigation
      ? `${navigation} navigation link${navigation === 1 ? "" : "s"}`
      : "",
    embeddedDocuments
      ? `${embeddedDocuments} embedded document${embeddedDocuments === 1 ? "" : "s"}`
      : "",
  ].filter(Boolean);
  return parts.length ? `blocked: ${parts.join(" · ")}` : "safe preview";
}

function familyLabel(family: AnimationFamily): string {
  return family === "none"
    ? "no animation"
    : `${family.toUpperCase()} animation`;
}

export class WorkbenchApp {
  readonly root: HTMLElement;
  readonly editor: EditorView;
  readonly preview: PreviewSession;

  #source = DEFAULT_SVG;
  #lastValid: ValidSvg | null = null;
  #previewTimer: number | undefined;
  #status: HTMLSpanElement;
  #previewMeta: HTMLSpanElement;
  #diagnostic: HTMLDivElement;
  #liveRegion: HTMLDivElement;
  #pauseButton: HTMLButtonElement;
  #restartButton: HTMLButtonElement;
  #time: HTMLSpanElement;
  #dirty = false;
  #baselineSource = DEFAULT_SVG;
  #stale = false;
  #clockFrame: number | undefined;
  #lastClockPaint = 0;
  #version = 0;
  #index: SourceIndex | null = null;
  #alignment: PreviewAlignment | null = null;
  #selectedId: number | null = null;
  #inspector: HTMLDivElement;
  #selectionBox: HTMLDivElement;
  #breadcrumb: HTMLDivElement;

  constructor(mount: HTMLElement) {
    const editorHost = h("div", { className: "editor-host" });
    const previewStage = h("div", { className: "preview-stage" });
    this.#inspector = h("div", {
      className: "preview-inspector",
      role: "region",
      "aria-label": "Rendered SVG inspector",
      onclick: (event) => this.#inspectPreview(event as MouseEvent),
    });
    this.#selectionBox = h("div", {
      className: "selection-box",
      hidden: true,
      "aria-hidden": "true",
      "data-testid": "selection-box",
    });
    this.#breadcrumb = h("div", { className: "breadcrumb" }, "no selection");

    this.#status = h("span", {
      className: "status",
      textContent: "checking",
      "data-testid": "document-status",
    });
    this.#previewMeta = h("span", {
      className: "pane-meta",
      textContent: "starting",
    });
    this.#diagnostic = h("div", {
      className: "diagnostic",
      role: "status",
      hidden: true,
      "data-testid": "diagnostic",
    });
    this.#liveRegion = h("div", {
      className: "sr-only",
      "aria-live": "polite",
      id: "live-region",
    });
    this.#time = h("span", {
      className: "playback-time",
      textContent: "0.00s",
      role: "timer",
      "aria-label": "Preview time",
    });
    this.#pauseButton = h("button", {
      type: "button",
      disabled: true,
      textContent: "pause",
      "aria-label": "Pause animation",
      onclick: () => this.#togglePlayback(),
    });
    this.#restartButton = h("button", {
      type: "button",
      disabled: true,
      textContent: "restart",
      onclick: () => void this.#restart(),
    });

    const shell = h(
      "div",
      { className: "app-shell" },
      h("h1", { className: "sr-only" }, "SVG workbench"),
      h(
        "header",
        { className: "top-rail" },
        h(
          "div",
          { className: "file-state" },
          h("span", { className: "wordmark" }, "svg"),
          h("span", { className: "filename" }, "untitled.svg"),
          this.#status,
        ),
        h(
          "div",
          {
            className: "rail-actions",
            role: "group",
            "aria-label": "Playback and file actions",
          },
          this.#time,
          this.#pauseButton,
          this.#restartButton,
          h("span", { className: "rail-separator", "aria-hidden": "true" }),
          h(
            "button",
            { type: "button", className: "file-action", disabled: true },
            "open",
          ),
          h(
            "button",
            { type: "button", className: "file-action", disabled: true },
            "download",
          ),
        ),
      ),
      h(
        "main",
        { className: "workbench" },
        h(
          "section",
          { className: "pane source-pane", "aria-labelledby": "source-title" },
          h(
            "header",
            { className: "pane-header" },
            h("h2", { id: "source-title" }, "source"),
            h("span", { className: "pane-meta" }, "XML · source of truth"),
          ),
          editorHost,
        ),
        h(
          "section",
          {
            className: "pane preview-pane",
            "aria-labelledby": "preview-title",
          },
          h(
            "header",
            { className: "pane-header" },
            h("h2", { id: "preview-title" }, "preview"),
            this.#previewMeta,
          ),
          h(
            "div",
            { className: "preview-wrap" },
            previewStage,
            this.#diagnostic,
          ),
        ),
      ),
      h(
        "footer",
        { className: "instrument-rail" },
        this.#breadcrumb,
        h(
          "div",
          { className: "rail-note" },
          "variables appear from root CSS custom properties",
        ),
      ),
      this.#liveRegion,
    );

    mount.replaceChildren(shell);
    this.root = shell;
    this.preview = new PreviewSession(previewStage, {
      onPlaybackChange: (state) => this.#renderPlayback(state),
    });
    previewStage.append(this.#inspector, this.#selectionBox);
    this.editor = createEditor({
      parent: editorHost,
      document: this.#source,
      onChange: (source) => this.#onSourceChange(source),
      onSelectionChange: (position) => this.#selectFromSource(position),
    });
    this.#validateAndPublish();
  }

  destroy(): void {
    window.clearTimeout(this.#previewTimer);
    window.cancelAnimationFrame(this.#clockFrame ?? 0);
    this.editor.destroy();
    this.preview.destroy();
  }

  #onSourceChange(source: string): void {
    this.#source = source;
    this.#version += 1;
    this.#index = null;
    this.#alignment = null;
    this.#hideSelectionBox();
    this.#dirty = source !== this.#baselineSource;
    this.#status.textContent = this.#dirty ? "checking · changed" : "checking";
    this.#status.classList.remove("status-error");
    window.clearTimeout(this.#previewTimer);
    this.#previewTimer = window.setTimeout(
      () => this.#validateAndPublish(),
      PREVIEW_DELAY,
    );
  }

  #validateAndPublish(): void {
    const validation = validateSvg(this.#source);
    if (!validation.ok) {
      const warm = Boolean(this.#lastValid);
      this.#stale = warm;
      const changed = this.#dirty ? " · changed" : "";
      this.#status.textContent = warm ? `stale${changed}` : `invalid${changed}`;
      this.#status.classList.add("status-error");
      this.#previewMeta.textContent = warm
        ? `last valid preview · ${disabledSummary(this.#lastValid!)}`
        : "nothing rendered";
      this.#showDiagnostic(formatDiagnostic(validation.diagnostic), warm);
      this.#pauseButton.disabled = !warm;
      this.#restartButton.disabled = !warm;
      return;
    }

    this.#lastValid = validation;
    this.#stale = false;
    this.#status.textContent = this.#dirty ? "valid · changed" : "valid";
    this.#status.classList.remove("status-error");
    this.#previewMeta.textContent = disabledSummary(validation);
    this.#diagnostic.hidden = true;
    this.#pauseButton.disabled = false;
    this.#restartButton.disabled = false;
    const index = new SourceIndex(this.#source, sourceVersion(this.#version));
    void this.#publishValid(validation, index).catch((error: unknown) => {
      if (Number(index.version) !== this.#version) return;
      this.#status.textContent = "preview failed";
      this.#status.classList.add("status-error");
      this.#showDiagnostic(
        error instanceof Error ? error.message : "Preview failed.",
        false,
      );
    });
  }

  async #publishValid(validation: ValidSvg, index: SourceIndex): Promise<void> {
    await this.preview.publish(validation);
    if (Number(index.version) !== this.#version) return;
    this.#index = index;
    this.#alignPreview(index);
    this.#selectFromSource(this.editor.state.selection.main.head);
  }

  #showDiagnostic(message: string, warm: boolean): void {
    this.#diagnostic.hidden = false;
    this.#diagnostic.replaceChildren(
      h(
        "strong",
        {},
        warm
          ? "Preview held at the last valid source."
          : "Nothing rendered yet.",
      ),
      h("span", {}, message),
    );
  }

  #togglePlayback(): void {
    if (this.preview.state.paused) this.preview.play();
    else this.preview.pause();
  }

  async #restart(): Promise<void> {
    if (!this.#lastValid) return;
    await this.preview.publish(this.#lastValid, { restart: true });
    if (this.#index) this.#alignPreview(this.#index);
    this.#announce("Preview restarted at zero seconds.");
  }

  #renderPlayback(state: PlaybackState): void {
    this.#pauseButton.textContent = state.paused ? "play" : "pause";
    this.#pauseButton.setAttribute(
      "aria-label",
      state.paused ? "Play animation" : "Pause animation",
    );
    this.#time.textContent = `${state.time.toFixed(2)}s`;
    this.#time.title = familyLabel(state.family);
    if (this.#lastValid && !this.#stale) {
      this.#previewMeta.textContent = `${familyLabel(state.family)} · ${disabledSummary(this.#lastValid)}`;
    }
    if (state.paused) this.#stopClock();
    else this.#startClock();
  }

  #startClock(): void {
    if (this.#clockFrame !== undefined) return;
    const tick = (timestamp: number): void => {
      if (this.preview.state.paused) {
        this.#clockFrame = undefined;
        return;
      }
      if (timestamp - this.#lastClockPaint > 80) {
        this.#time.textContent = `${this.preview.sampleTime().toFixed(2)}s`;
        this.#updateSelectionBox();
        this.#lastClockPaint = timestamp;
      }
      this.#clockFrame = window.requestAnimationFrame(tick);
    };
    this.#clockFrame = window.requestAnimationFrame(tick);
  }

  #stopClock(): void {
    window.cancelAnimationFrame(this.#clockFrame ?? 0);
    this.#clockFrame = undefined;
    this.#updateSelectionBox();
  }

  #alignPreview(index: SourceIndex): void {
    const root = this.preview.root;
    this.#alignment = root ? alignPreviewElements(index, root) : null;
    if (!this.#alignment?.complete) {
      this.#announce("Some preview elements could not be linked to source.");
    }
  }

  #selectFromSource(position: number): void {
    const element = this.#index?.deepestAt(position);
    if (element) this.#selectElement(element, false);
  }

  #inspectPreview(event: MouseEvent): void {
    if (!this.#index || !this.#alignment || this.#stale) return;
    let previewElement = this.preview.document?.elementFromPoint(
      event.offsetX,
      event.offsetY,
    );
    let sourceElement: SourceElement | undefined;
    while (previewElement && !sourceElement) {
      sourceElement = this.#alignment.byElement.get(previewElement);
      previewElement = previewElement.parentElement;
    }
    if (!sourceElement) return;
    if (event.shiftKey)
      sourceElement = this.#index.parent(sourceElement) ?? sourceElement;
    this.#selectElement(sourceElement, true);
  }

  #selectElement(element: SourceElement, revealSource: boolean): void {
    if (!this.#index) return;
    this.#selectedId = element.id;
    if (revealSource) {
      this.editor.dispatch({
        selection: EditorSelection.range(
          element.tagNameRange.from,
          element.tagNameRange.to,
        ),
        effects: EditorView.scrollIntoView(element.openTagRange.from, {
          y: "center",
        }),
      });
      this.editor.focus();
    }
    this.#renderBreadcrumb(element);
    this.#updateSelectionBox();
  }

  #renderBreadcrumb(element: SourceElement): void {
    if (!this.#index) return;
    const children: Node[] = [];
    for (const [position, ancestor] of this.#index
      .ancestors(element)
      .entries()) {
      if (position) children.push(document.createTextNode("›"));
      const id = ancestor.attributes.get("id")?.value;
      const className = ancestor.attributes
        .get("class")
        ?.value?.split(/\s+/)[0];
      const label = `${ancestor.name}${id ? `#${id}` : className ? `.${className}` : ""}`;
      children.push(
        h(
          "button",
          {
            type: "button",
            className: "breadcrumb-link",
            onclick: () => this.#selectElement(ancestor, true),
          },
          label,
        ),
      );
    }
    this.#breadcrumb.replaceChildren(...children);
  }

  #updateSelectionBox(): void {
    const previewElement =
      this.#selectedId === null
        ? null
        : this.#alignment?.byId.get(this.#selectedId);
    if (!previewElement) {
      this.#hideSelectionBox();
      return;
    }
    const elementRect = previewElement.getBoundingClientRect();
    const iframeRect = this.preview.iframe.getBoundingClientRect();
    const stageRect = this.#inspector.parentElement?.getBoundingClientRect();
    if (!stageRect || elementRect.width <= 0 || elementRect.height <= 0) {
      this.#hideSelectionBox();
      return;
    }
    this.#selectionBox.hidden = false;
    Object.assign(this.#selectionBox.style, {
      left: `${iframeRect.left - stageRect.left + elementRect.left}px`,
      top: `${iframeRect.top - stageRect.top + elementRect.top}px`,
      width: `${elementRect.width}px`,
      height: `${elementRect.height}px`,
    });
  }

  #hideSelectionBox(): void {
    this.#selectionBox.hidden = true;
  }

  #announce(message: string): void {
    this.#liveRegion.textContent = message;
  }
}
