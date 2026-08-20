import { EditorSelection, Transaction } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  applyEditIntent,
  formatSteppedNumber,
  replaceIntent,
} from "../document/editIntent";
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
import { FileEnvelope } from "../files/FileEnvelope";
import { normalizeSvgFilename } from "../files/filename";
import {
  clearRecovery,
  loadRecovery,
  saveRecovery,
  type RecoveryRecord,
} from "../files/recovery";
import {
  PreviewSession,
  type AnimationFamily,
  type PlaybackState,
} from "../preview/PreviewSession";
import { inspectionHorizonLabel } from "../preview/inspectionHorizon";
import { h } from "../ui/dom";
import {
  discoverRootVariables,
  type SourceVariable,
} from "../variables/discover";

const PREVIEW_DELAY = 140;
const DEFAULT_FILENAME = "orbit-pulse.svg";

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

interface VariableGesture {
  readonly name: string;
  readonly original: string;
  readonly sliderOriginalValue: string;
  readonly input: HTMLInputElement;
  readonly pointerId: number;
  from: number;
  to: number;
  final: string;
}

type SourceReveal = "none" | "follow" | "handoff";
type RecoveryState = "probing" | "offering" | "active" | "unavailable";

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
  #horizon: HTMLSpanElement;
  #dirty = false;
  #baselineSource = DEFAULT_SVG;
  #stale = false;
  #clockFrame: number | undefined;
  #lastClockPaint = 0;
  #version = 0;
  #index: SourceIndex | null = null;
  #alignment: PreviewAlignment | null = null;
  #selectedId: number | null = null;
  #selectedVersion = -1;
  #inspector: HTMLDivElement;
  #previewOption: HTMLDivElement;
  #navigableElements: readonly SourceElement[] = [];
  #syncingSelection = false;
  #selectionBox: HTMLDivElement;
  #resizeObserver: ResizeObserver;
  #geometryFrame: number | undefined;
  #breadcrumb: HTMLDivElement;
  #controls: HTMLDivElement;
  #scrubber: HTMLInputElement;
  #gesture: VariableGesture | null = null;
  #ignoredSlider: HTMLInputElement | null = null;
  #ignoredSliderValue = "";
  #applyingGesture = false;
  #envelope = FileEnvelope.new(DEFAULT_FILENAME, DEFAULT_SVG);
  #currentFilename = DEFAULT_FILENAME;
  #baselineFilename = DEFAULT_FILENAME;
  #filenameButton: HTMLButtonElement;
  #filenameInput: HTMLInputElement;
  #filenameError: HTMLSpanElement;
  #renaming = false;
  #sourceMeta: HTMLSpanElement;
  #fileInput: HTMLInputElement;
  #recoveryNotice: HTMLDivElement;
  #recoveryTimer: number | undefined;
  #recoveryState: RecoveryState = "probing";
  #recoveryChain: Promise<void> = Promise.resolve();
  #pendingDownloadRecovery: RecoveryRecord | null = null;
  #downloadUnconfirmed = false;
  #closed = false;

  constructor(mount: HTMLElement) {
    const editorHost = h("div", { className: "editor-host" });
    const previewStage = h("div", { className: "preview-stage" });
    const inspectorHelp = h(
      "span",
      { className: "sr-only", id: "preview-inspector-help" },
      "Use Up and Down to move through rendered elements, Home and End to jump, Left or Shift plus Up to select a parent, Right to select its first child, and Enter to focus the source.",
    );
    this.#previewOption = h("div", {
      className: "preview-option sr-only",
      role: "option",
      "aria-selected": "true",
    });
    this.#inspector = h(
      "div",
      {
        className: "preview-inspector",
        role: "listbox",
        tabindex: 0,
        "aria-label": "Rendered elements",
        "aria-describedby": "preview-inspector-help",
        "aria-orientation": "vertical",
        onclick: (event) => this.#inspectPreview(event as MouseEvent),
        onfocus: () => this.#focusInspector(),
        onkeydown: (event) =>
          this.#handleInspectorKeydown(event as KeyboardEvent),
      },
      this.#previewOption,
    );
    this.#selectionBox = h("div", {
      className: "selection-box",
      hidden: true,
      "aria-hidden": "true",
      "data-testid": "selection-box",
    });
    this.#breadcrumb = h("div", { className: "breadcrumb" }, "no selection");
    this.#filenameButton = h(
      "button",
      {
        type: "button",
        className: "filename filename-button",
        title: "Rename SVG file",
        onclick: () => this.#beginFilenameEdit(),
      },
      DEFAULT_FILENAME,
    );
    this.#filenameInput = h("input", {
      type: "text",
      className: "filename filename-input",
      value: DEFAULT_FILENAME,
      hidden: true,
      autocomplete: "off",
      spellcheck: "false",
      "aria-label": "SVG filename",
      onkeydown: (event) => this.#handleFilenameKeydown(event as KeyboardEvent),
      oninput: () => this.#clearFilenameError(),
      onblur: () => this.#commitFilenameEdit(false),
    });
    this.#filenameError = h("span", {
      className: "filename-error",
      role: "alert",
      hidden: true,
    });
    this.#renderFilename();
    this.#sourceMeta = h("span", {
      className: "pane-meta",
      textContent: "XML · source of truth",
    });
    this.#fileInput = h("input", {
      type: "file",
      accept: ".svg,image/svg+xml",
      hidden: true,
      "aria-label": "Open SVG file",
      onchange: (event) => void this.#openSelectedFile(event),
    });
    this.#recoveryNotice = h("div", {
      className: "recovery-notice",
      role: "status",
      hidden: true,
    });
    this.#controls = h("div", {
      className: "variable-controls",
      "aria-label": "SVG variables",
    });
    this.#scrubber = h("input", {
      className: "time-scrubber",
      type: "range",
      min: 0,
      max: 10,
      step: 0.01,
      value: 0,
      "aria-label": "Inspection time",
      "aria-describedby": "inspection-horizon",
      oninput: (event) =>
        this.preview.seek(
          Number((event.currentTarget as HTMLInputElement).value),
        ),
    });

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
    this.#horizon = h("span", {
      className: "playback-horizon",
      id: "inspection-horizon",
      textContent: "horizon 10s · no animation timing",
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
          h("span", { className: "wordmark" }, "yalethom.as/svg"),
          this.#filenameButton,
          this.#filenameInput,
          this.#filenameError,
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
          this.#horizon,
          this.#scrubber,
          this.#pauseButton,
          this.#restartButton,
          h("span", { className: "rail-separator", "aria-hidden": "true" }),
          h(
            "button",
            {
              type: "button",
              className: "file-action",
              onclick: () => this.#fileInput.click(),
            },
            "open",
          ),
          h(
            "button",
            {
              type: "button",
              className: "file-action",
              onclick: () => this.#download(),
            },
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
            this.#sourceMeta,
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
        this.#controls,
      ),
      this.#liveRegion,
      inspectorHelp,
      this.#fileInput,
      this.#recoveryNotice,
    );

    mount.replaceChildren(shell);
    this.root = shell;
    this.preview = new PreviewSession(previewStage, {
      onPlaybackChange: (state) => this.#renderPlayback(state),
    });
    previewStage.append(this.#inspector, this.#selectionBox);
    this.#resizeObserver = new ResizeObserver(() =>
      this.#scheduleSelectionGeometry(),
    );
    this.#resizeObserver.observe(previewStage);
    this.editor = createEditor({
      parent: editorHost,
      document: this.#source,
      onChange: (source) => this.#onSourceChange(source),
      onSelectionChange: (position) => this.#selectFromSource(position),
    });
    this.#validateAndPublish();
    void this.#offerRecovery();
  }

  destroy(): void {
    this.#closed = true;
    window.clearTimeout(this.#previewTimer);
    window.clearTimeout(this.#recoveryTimer);
    window.cancelAnimationFrame(this.#clockFrame ?? 0);
    window.cancelAnimationFrame(this.#geometryFrame ?? 0);
    this.#resizeObserver.disconnect();
    this.editor.destroy();
    this.preview.destroy();
  }

  #onSourceChange(source: string): void {
    this.#source = source;
    this.#version += 1;
    this.#index = null;
    this.#alignment = null;
    this.#navigableElements = [];
    this.#syncPreviewOption(null, false);
    this.#hideSelectionBox();
    this.#syncDirtyState();
    this.#status.textContent = this.#dirty ? "checking · changed" : "checking";
    this.#status.classList.remove("status-error");
    if (this.#gesture && !this.#applyingGesture) {
      this.#gesture = null;
      this.#announce("Variable gesture stopped because the source changed.");
    }
    if (this.#applyingGesture) return;
    this.#scheduleRecovery();
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
      this.#renderVariables([], "controls unavailable while source is invalid");
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
    this.preview.iframe.dataset.sourceVersion = String(index.version);
    this.#index = index;
    this.#alignPreview(index);
    this.#selectFromSource(this.editor.state.selection.main.head);
    this.#renderVariables(discoverRootVariables(index, validation.document));
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
    const horizon = inspectionHorizonLabel(state.horizon);
    const max = String(state.horizon.seconds);
    const step = state.horizon.seconds < 1 ? "0.001" : "0.01";
    this.#pauseButton.textContent = state.paused ? "play" : "pause";
    this.#pauseButton.setAttribute(
      "aria-label",
      state.paused ? "Play animation" : "Pause animation",
    );
    this.#time.textContent = `${state.time.toFixed(2)}s`;
    if (this.#scrubber.max !== max) this.#scrubber.max = max;
    if (this.#scrubber.step !== step) this.#scrubber.step = step;
    this.#scrubber.value = String(Math.min(state.horizon.seconds, state.time));
    this.#scrubber.title = horizon;
    this.#horizon.textContent = horizon;
    this.#horizon.title = horizon;
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
        this.#scrubber.value = String(
          Math.min(Number(this.#scrubber.max), this.preview.state.time),
        );
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
    this.#navigableElements = this.#alignment
      ? index.elements.filter((element) =>
          this.#alignment?.byId.has(element.id),
        )
      : [];
    if (!this.#alignment?.complete) {
      this.#announce("Some preview elements could not be linked to source.");
    }
    if (this.#selectedVersion === this.#version) {
      this.#refreshSelectionPresentation();
    } else {
      this.#hideSelectionBox();
      this.#syncPreviewOption(null, false);
    }
  }

  #selectFromSource(position: number): void {
    if (this.#syncingSelection) return;
    const element = this.#index?.deepestAt(position);
    if (element) this.#selectElement(element, "none");
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
    this.#selectElement(sourceElement, "handoff");
  }

  #selectElement(element: SourceElement, reveal: SourceReveal): void {
    if (!this.#index) return;
    const changed =
      this.#selectedId !== element.id ||
      this.#selectedVersion !== this.#version;
    this.#selectedId = element.id;
    this.#selectedVersion = this.#version;
    if (reveal !== "none") {
      this.#syncingSelection = true;
      try {
        this.editor.dispatch({
          selection: EditorSelection.range(
            element.tagNameRange.from,
            element.tagNameRange.to,
          ),
          effects: EditorView.scrollIntoView(element.openTagRange.from, {
            y: reveal === "handoff" ? "center" : "nearest",
          }),
        });
      } finally {
        this.#syncingSelection = false;
      }
      if (reveal === "handoff") this.editor.focus();
    }
    if (changed) this.#renderBreadcrumb(element);
    this.#refreshSelectionPresentation();
  }

  #focusInspector(): void {
    if (!this.#inspectorIsAvailable()) return;
    const selected =
      this.#selectedId === null
        ? null
        : this.#navigableElements.find(
            (element) => element.id === this.#selectedId,
          );
    const target = selected ?? this.#navigableElements[0];
    if (selected) this.#refreshSelectionPresentation();
    else if (target) this.#selectElement(target, "follow");
  }

  #handleInspectorKeydown(event: KeyboardEvent): void {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const handled = [
      "ArrowDown",
      "ArrowUp",
      "ArrowLeft",
      "ArrowRight",
      "Home",
      "End",
      "Enter",
    ].includes(event.key);
    if (!handled) return;
    event.preventDefault();
    if (!this.#inspectorIsAvailable()) return;

    const currentPosition = this.#navigableElements.findIndex(
      (element) => element.id === this.#selectedId,
    );
    const current = this.#navigableElements[currentPosition] ?? null;
    if (event.key === "Enter") {
      if (current) this.#selectElement(current, "handoff");
      return;
    }

    let target: SourceElement | undefined;
    if (event.key === "Home") target = this.#navigableElements[0];
    else if (event.key === "End") target = this.#navigableElements.at(-1);
    else if (event.key === "ArrowDown") {
      target = this.#navigableElements[currentPosition + 1];
      if (!target) this.#announce("Last mapped element.");
    } else if (event.key === "ArrowUp" && !event.shiftKey) {
      target = this.#navigableElements[currentPosition - 1];
      if (!target) this.#announce("First mapped element.");
    } else if (
      (event.key === "ArrowUp" && event.shiftKey) ||
      event.key === "ArrowLeft"
    ) {
      target = current ? this.#mappedParent(current) : undefined;
      if (!target) this.#announce("This element has no authored parent.");
    } else if (event.key === "ArrowRight") {
      target = current
        ? this.#navigableElements.find(
            (element) => element.parentId === current.id,
          )
        : undefined;
      if (!target) this.#announce("This element has no authored child.");
    }
    if (target && this.#alignment?.byId.has(target.id)) {
      this.#selectElement(target, "follow");
    }
  }

  #inspectorIsAvailable(): boolean {
    if (
      this.#stale ||
      !this.#index ||
      !this.#alignment ||
      this.#navigableElements.length === 0
    ) {
      this.#announce(
        this.#stale
          ? "Preview is held at the last valid source; selection is unavailable."
          : "Preview selection is unavailable while source mapping updates.",
      );
      return false;
    }
    return true;
  }

  #mappedParent(element: SourceElement): SourceElement | undefined {
    let parent = this.#index?.parent(element) ?? null;
    while (parent && !this.#alignment?.byId.has(parent.id)) {
      parent = this.#index?.parent(parent) ?? null;
    }
    return parent ?? undefined;
  }

  #renderBreadcrumb(element: SourceElement): void {
    if (!this.#index) return;
    const children: Node[] = [];
    for (const [position, ancestor] of this.#index
      .ancestors(element)
      .entries()) {
      if (position) children.push(document.createTextNode("›"));
      children.push(
        h(
          "button",
          {
            type: "button",
            className: "breadcrumb-link",
            onclick: () => this.#selectElement(ancestor, "handoff"),
          },
          this.#sourceElementLabel(ancestor),
        ),
      );
    }
    this.#breadcrumb.replaceChildren(...children);
  }

  #sourceElementLabel(element: SourceElement): string {
    const id = element.attributes.get("id")?.value;
    const className = element.attributes.get("class")?.value?.split(/\s+/)[0];
    return `${element.name}${id ? `#${id}` : className ? `.${className}` : ""}`;
  }

  #refreshSelectionPresentation(): void {
    const element =
      this.#selectedId === null ? null : this.#index?.element(this.#selectedId);
    const hasGeometry = this.#updateSelectionBox();
    this.#syncPreviewOption(element ?? null, hasGeometry);
  }

  #syncPreviewOption(
    element: SourceElement | null,
    hasGeometry: boolean,
  ): void {
    const position = element
      ? this.#navigableElements.findIndex(
          (candidate) => candidate.id === element.id,
        )
      : -1;
    if (!element || position < 0) {
      this.#inspector.removeAttribute("aria-activedescendant");
      this.#previewOption.removeAttribute("id");
      this.#previewOption.removeAttribute("aria-posinset");
      this.#previewOption.removeAttribute("aria-setsize");
      this.#previewOption.setAttribute("aria-selected", "false");
      this.#previewOption.textContent = "";
      return;
    }

    const optionId = `preview-option-${this.#version}-${element.id}`;
    this.#previewOption.id = optionId;
    this.#previewOption.setAttribute("aria-selected", "true");
    this.#previewOption.setAttribute("aria-posinset", String(position + 1));
    this.#previewOption.setAttribute(
      "aria-setsize",
      String(this.#navigableElements.length),
    );
    this.#previewOption.textContent = `${this.#sourceElementLabel(element)}${hasGeometry ? "" : ", no rendered geometry"}`;
    this.#inspector.setAttribute("aria-activedescendant", optionId);
  }

  #scheduleSelectionGeometry(): void {
    if (this.#geometryFrame !== undefined) return;
    this.#geometryFrame = window.requestAnimationFrame(() => {
      this.#geometryFrame = undefined;
      this.#refreshSelectionPresentation();
    });
  }

  #updateSelectionBox(): boolean {
    const previewElement =
      this.#selectedId === null
        ? null
        : this.#alignment?.byId.get(this.#selectedId);
    if (!previewElement) {
      this.#hideSelectionBox();
      return false;
    }
    const elementRect = previewElement.getBoundingClientRect();
    const iframeRect = this.preview.iframe.getBoundingClientRect();
    const stageRect = this.#inspector.parentElement?.getBoundingClientRect();
    if (!stageRect || elementRect.width <= 0 || elementRect.height <= 0) {
      this.#hideSelectionBox();
      return false;
    }
    this.#selectionBox.hidden = false;
    Object.assign(this.#selectionBox.style, {
      left: `${iframeRect.left - stageRect.left + elementRect.left}px`,
      top: `${iframeRect.top - stageRect.top + elementRect.top}px`,
      width: `${elementRect.width}px`,
      height: `${elementRect.height}px`,
    });
    return true;
  }

  #hideSelectionBox(): void {
    this.#selectionBox.hidden = true;
  }

  #renderVariables(
    variables: readonly SourceVariable[],
    emptyMessage = "no root variables",
  ): void {
    const activeLabel =
      document.activeElement instanceof HTMLInputElement &&
      this.#controls.contains(document.activeElement)
        ? document.activeElement.getAttribute("aria-label")
        : null;
    if (!variables.length) {
      this.#controls.replaceChildren(
        h("span", { className: "rail-note" }, emptyMessage),
      );
      return;
    }
    this.#controls.replaceChildren(
      ...variables.map((variable) => this.#variableControl(variable)),
    );
    if (activeLabel) {
      const replacement = [...this.#controls.querySelectorAll("input")].find(
        (input) => input.getAttribute("aria-label") === activeLabel,
      );
      replacement?.focus({ preventScroll: true });
    }
  }

  #variableControl(variable: SourceVariable): HTMLElement {
    const value = h("input", {
      className: "variable-value",
      type: "text",
      value: variable.value,
      spellcheck: false,
      "aria-label": `${variable.label} value`,
      title: `${variable.name} · ${variable.usageCount} use${variable.usageCount === 1 ? "" : "s"}`,
      onchange: (event) => {
        const input = event.currentTarget as HTMLInputElement;
        this.#commitVariable(variable, input.value.trim(), input);
      },
    });
    const children: Node[] = [
      h("span", { className: "variable-label" }, variable.label),
      value,
    ];

    if (variable.directive && variable.numeric) {
      const { min, max, step } = variable.directive;
      const slider = h("input", {
        className: "variable-slider",
        type: "range",
        min,
        max,
        step,
        value: variable.numeric.value,
        "aria-label": `${variable.label} range`,
        onpointerdown: (event) =>
          this.#beginVariableGesture(variable, event as PointerEvent),
        oninput: (event) => {
          const input = event.currentTarget as HTMLInputElement;
          if (this.#ignoredSlider === input) {
            input.value = this.#ignoredSliderValue;
            return;
          }
          const literal = `${formatSteppedNumber(Number(input.value), step)}${variable.numeric!.unit}`;
          if (this.#gesture?.input === input)
            this.#updateVariableGesture(literal);
          else this.#commitVariable(variable, literal, input);
          value.value = literal;
        },
        onpointerup: (event) =>
          this.#finishSliderPointer(event.currentTarget as HTMLInputElement),
        onpointercancel: () => this.#cancelVariableGesture(true),
        onkeydown: (event) => {
          if ((event as KeyboardEvent).key === "Escape") {
            event.preventDefault();
            this.#cancelVariableGesture(false);
          }
        },
      });
      children.push(slider);
    }

    return h(
      "label",
      { className: "variable-control", "data-variable": variable.name },
      ...children,
    );
  }

  #commitVariable(
    variable: SourceVariable,
    literal: string,
    input: HTMLInputElement,
  ): void {
    const resolved = this.#resolveVariable(variable.name);
    if (!literal || !resolved) {
      input.value = variable.value;
      this.#announce("The variable no longer has an editable source value.");
      return;
    }
    const applied = applyEditIntent(
      this.editor,
      sourceVersion(this.#version),
      replaceIntent(
        resolved.index.version,
        resolved.variable.valueRange,
        literal,
      ),
      { isolate: true },
    );
    if (!applied) {
      input.value = variable.value;
      this.#announce(
        "The variable changed in source; the edit was not applied.",
      );
    }
  }

  #beginVariableGesture(variable: SourceVariable, event: PointerEvent): void {
    const resolved = this.#resolveVariable(variable.name);
    if (!resolved) return;
    window.clearTimeout(this.#previewTimer);
    this.#previewTimer = undefined;
    const input = event.currentTarget as HTMLInputElement;
    this.#ignoredSlider = null;
    this.#ignoredSliderValue = "";
    this.#gesture = {
      name: variable.name,
      original: resolved.variable.value,
      sliderOriginalValue: input.value,
      input,
      pointerId: event.pointerId,
      from: resolved.variable.valueRange.from,
      to: resolved.variable.valueRange.to,
      final: resolved.variable.value,
    };
    try {
      input.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic input and older engines may not expose pointer capture.
    }
  }

  #updateVariableGesture(literal: string): void {
    const gesture = this.#gesture;
    if (!gesture) return;
    this.#applyingGesture = true;
    const applied = applyEditIntent(
      this.editor,
      sourceVersion(this.#version),
      replaceIntent(
        sourceVersion(this.#version),
        { from: gesture.from, to: gesture.to },
        literal,
      ),
      { addToHistory: false },
    );
    this.#applyingGesture = false;
    if (!applied) return this.#cancelVariableGesture(false);
    gesture.to = gesture.from + literal.length;
    gesture.final = literal;
    this.preview.root?.style.setProperty(gesture.name, literal);
  }

  #commitVariableGesture(): void {
    const gesture = this.#gesture;
    if (!gesture) return;
    if (gesture.final === gesture.original) {
      this.#gesture = null;
      if (!this.#index) this.#validateAndPublish();
      return;
    }
    this.#applyingGesture = true;
    applyEditIntent(
      this.editor,
      sourceVersion(this.#version),
      replaceIntent(
        sourceVersion(this.#version),
        { from: gesture.from, to: gesture.to },
        gesture.original,
      ),
      { addToHistory: false },
    );
    gesture.to = gesture.from + gesture.original.length;
    applyEditIntent(
      this.editor,
      sourceVersion(this.#version),
      replaceIntent(
        sourceVersion(this.#version),
        { from: gesture.from, to: gesture.to },
        gesture.final,
      ),
      { isolate: true },
    );
    this.#applyingGesture = false;
    this.#gesture = null;
    this.#scheduleRecovery();
    this.#validateAndPublish();
  }

  #cancelVariableGesture(pointerEnded: boolean): void {
    const gesture = this.#gesture;
    if (!gesture) return;
    this.#applyingGesture = true;
    applyEditIntent(
      this.editor,
      sourceVersion(this.#version),
      replaceIntent(
        sourceVersion(this.#version),
        { from: gesture.from, to: gesture.to },
        gesture.original,
      ),
      { addToHistory: false },
    );
    this.#applyingGesture = false;
    this.preview.root?.style.setProperty(gesture.name, gesture.original);
    gesture.input.value = gesture.sliderOriginalValue;
    if (!pointerEnded) {
      this.#ignoredSlider = gesture.input;
      this.#ignoredSliderValue = gesture.sliderOriginalValue;
      try {
        gesture.input.releasePointerCapture(gesture.pointerId);
      } catch {
        // The pointer may already have ended or capture may be unavailable.
      }
    }
    this.#gesture = null;
    this.#scheduleRecovery();
    this.#validateAndPublish();
  }

  #finishSliderPointer(input: HTMLInputElement): void {
    if (this.#ignoredSlider === input) {
      this.#ignoredSlider = null;
      this.#ignoredSliderValue = "";
      return;
    }
    this.#commitVariableGesture();
  }

  #resolveVariable(
    name: string,
  ): { index: SourceIndex; variable: SourceVariable } | null {
    const validation = validateSvg(this.#source);
    if (!validation.ok) return null;
    const index = new SourceIndex(this.#source, sourceVersion(this.#version));
    const variable = discoverRootVariables(index, validation.document).find(
      (candidate) => candidate.name === name,
    );
    return variable ? { index, variable } : null;
  }

  #beginFilenameEdit(): void {
    this.#clearFilenameError();
    this.#renaming = true;
    this.#filenameButton.hidden = true;
    this.#filenameInput.hidden = false;
    this.#filenameInput.value = this.#currentFilename;
    this.#filenameInput.focus();
    const extension = this.#currentFilename.toLowerCase().endsWith(".svg")
      ? this.#currentFilename.length - 4
      : this.#currentFilename.length;
    this.#filenameInput.setSelectionRange(0, extension);
  }

  #handleFilenameKeydown(event: KeyboardEvent): void {
    if (event.key === "Enter") {
      event.preventDefault();
      this.#commitFilenameEdit(true);
    } else if (event.key === "Escape") {
      event.preventDefault();
      this.#cancelFilenameEdit();
    }
  }

  #commitFilenameEdit(focusButton: boolean): void {
    if (!this.#renaming) return;
    const filename = normalizeSvgFilename(this.#filenameInput.value);
    if (!filename) {
      this.#showFilenameError(
        "Use a non-empty filename without path or reserved characters.",
      );
      if (focusButton) {
        this.#filenameInput.focus();
        this.#filenameInput.select();
      } else {
        this.#endFilenameEdit(false);
      }
      return;
    }

    const previous = this.#currentFilename;
    this.#currentFilename = filename;
    this.#clearFilenameError();
    this.#endFilenameEdit(focusButton);
    this.#renderFilename();
    this.#syncDirtyState();
    this.#renderDirtyStatus();
    this.#scheduleRecovery();
    if (filename !== previous) this.#announce(`Renamed to ${filename}.`);
  }

  #cancelFilenameEdit(): void {
    if (!this.#renaming) return;
    this.#clearFilenameError();
    this.#endFilenameEdit(true);
    this.#announce("Filename edit cancelled.");
  }

  #endFilenameEdit(focusButton: boolean): void {
    this.#renaming = false;
    this.#filenameInput.hidden = true;
    this.#filenameInput.value = this.#currentFilename;
    this.#filenameButton.hidden = false;
    if (focusButton) this.#filenameButton.focus();
  }

  #renderFilename(): void {
    this.#filenameButton.textContent = this.#currentFilename;
    this.#filenameButton.setAttribute(
      "aria-label",
      `Rename ${this.#currentFilename}`,
    );
    if (!this.#renaming) this.#filenameInput.value = this.#currentFilename;
  }

  #showFilenameError(message: string): void {
    this.#filenameInput.setAttribute("aria-invalid", "true");
    this.#filenameInput.setAttribute("aria-describedby", "filename-error");
    this.#filenameError.id = "filename-error";
    this.#filenameError.textContent = message;
    this.#filenameError.hidden = false;
  }

  #clearFilenameError(): void {
    this.#filenameInput.removeAttribute("aria-invalid");
    this.#filenameInput.removeAttribute("aria-describedby");
    this.#filenameError.textContent = "";
    this.#filenameError.hidden = true;
  }

  #syncDirtyState(): void {
    this.#dirty =
      this.#source !== this.#baselineSource ||
      this.#currentFilename !== this.#baselineFilename;
  }

  #renderDirtyStatus(): void {
    const status = (this.#status.textContent || "checking").replace(
      / · changed$/u,
      "",
    );
    this.#status.textContent = this.#dirty ? `${status} · changed` : status;
  }

  async #openSelectedFile(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    try {
      const envelope = FileEnvelope.fromBytes(
        file.name,
        await file.arrayBuffer(),
      );
      if (!this.#confirmReplace(`open ${file.name}`)) return;
      this.#loadEnvelope(envelope, envelope.source);
      this.#announce(`${file.name} opened locally.`);
    } catch (error) {
      this.#announce(
        error instanceof Error
          ? `Could not open file: ${error.message}`
          : "Could not open file.",
      );
    }
  }

  #loadEnvelope(
    envelope: FileEnvelope,
    source: string,
    filename = envelope.filename,
  ): void {
    this.#pendingDownloadRecovery = null;
    this.#downloadUnconfirmed = false;
    this.#envelope = envelope;
    this.#baselineSource = envelope.source;
    this.#baselineFilename = envelope.filename;
    this.#currentFilename = filename;
    this.#clearFilenameError();
    this.#endFilenameEdit(false);
    this.#renderFilename();
    this.#sourceMeta.textContent = envelope.mixedLineEndings
      ? "XML · mixed EOL → LF after edit"
      : "XML · source of truth";
    this.editor.dispatch({
      changes: { from: 0, to: this.editor.state.doc.length, insert: source },
      selection: EditorSelection.cursor(0),
      annotations: Transaction.addToHistory.of(false),
    });
    this.#syncDirtyState();
    this.#renderDirtyStatus();
    this.#scheduleRecovery();
  }

  #download(): void {
    const hadPendingChanges = this.#dirty;
    if (hadPendingChanges) {
      const recovery = this.#currentRecovery();
      if (this.#recoveryState === "active")
        this.#queueRecovery(() => saveRecovery(recovery));
      else this.#pendingDownloadRecovery = recovery;
    }
    const bytes = this.#envelope.export(this.#source);
    const blob = new Blob([bytes.slice().buffer], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = this.#currentFilename;
    link.click();
    URL.revokeObjectURL(url);
    this.#downloadUnconfirmed ||= hadPendingChanges;

    this.#envelope = FileEnvelope.fromBytes(link.download, bytes);
    this.#baselineSource = this.#source;
    this.#baselineFilename = this.#currentFilename;
    this.#syncDirtyState();
    this.#renderDirtyStatus();
    this.#announce(`${link.download} download started.`);
  }

  #scheduleRecovery(): void {
    window.clearTimeout(this.#recoveryTimer);
    this.#recoveryTimer = window.setTimeout(() => {
      if (this.#closed || this.#recoveryState !== "active") return;
      if (!this.#dirty) {
        if (!this.#downloadUnconfirmed)
          this.#queueRecovery(() => clearRecovery());
        return;
      }
      this.#queueRecoverySave();
    }, 350);
  }

  async #offerRecovery(): Promise<void> {
    let recovery: RecoveryRecord | undefined;
    try {
      recovery = await loadRecovery();
    } catch {
      this.#failRecovery();
      return;
    }
    if (this.#closed) return;
    if (!recovery) {
      this.#activateRecovery();
      return;
    }
    const baselineFilename = recovery.baselineFilename ?? recovery.filename;
    if (
      recovery.source === recovery.baseline &&
      recovery.filename === baselineFilename
    ) {
      this.#activateRecovery();
      return;
    }
    this.#recoveryState = "offering";
    const age = new Date(recovery.updatedAt).toLocaleString();
    this.#recoveryNotice.hidden = false;
    this.#recoveryNotice.replaceChildren(
      h(
        "span",
        {},
        `Recovery copy of ${recovery.filename} from ${age} — autosave paused until you restore or discard.`,
      ),
      h(
        "button",
        { type: "button", onclick: () => this.#restoreRecovery(recovery) },
        "restore",
      ),
      h(
        "button",
        { type: "button", onclick: () => void this.#discardRecovery() },
        "discard",
      ),
    );
  }

  #restoreRecovery(recovery: RecoveryRecord): void {
    if (this.#recoveryState !== "offering") return;
    if (!this.#confirmReplace(`restore ${recovery.filename}`)) return;
    const envelope = FileEnvelope.fromBytes(
      recovery.baselineFilename ?? recovery.filename,
      recovery.originalBytes,
    );
    this.#recoveryState = "active";
    this.#recoveryNotice.hidden = true;
    this.#loadEnvelope(envelope, recovery.source, recovery.filename);
    this.#announce("Recovery copy restored.");
  }

  async #discardRecovery(): Promise<void> {
    if (this.#recoveryState !== "offering") return;
    for (const button of this.#recoveryNotice.querySelectorAll("button"))
      button.setAttribute("disabled", "");
    try {
      await clearRecovery();
    } catch {
      this.#failRecovery();
      return;
    }
    if (this.#closed) return;
    this.#recoveryNotice.hidden = true;
    this.#announce("Recovery copy discarded.");
    this.#activateRecovery();
  }

  #activateRecovery(): void {
    if (this.#closed) return;
    this.#recoveryState = "active";
    const pending = this.#pendingDownloadRecovery;
    this.#pendingDownloadRecovery = null;
    if (pending) this.#queueRecovery(() => saveRecovery(pending));
    this.#scheduleRecovery();
  }

  #queueRecoverySave(): void {
    const record = this.#currentRecovery();
    this.#queueRecovery(() => saveRecovery(record));
  }

  #currentRecovery(): RecoveryRecord {
    return {
      source: this.#source,
      baseline: this.#baselineSource,
      filename: this.#currentFilename,
      baselineFilename: this.#baselineFilename,
      originalBytes: this.#envelope.export(this.#envelope.source),
      updatedAt: Date.now(),
    };
  }

  #queueRecovery(operation: () => Promise<unknown>): void {
    if (this.#closed || this.#recoveryState !== "active") return;
    this.#recoveryChain = this.#recoveryChain.then(async () => {
      if (this.#closed || this.#recoveryState !== "active") return;
      try {
        await operation();
      } catch {
        this.#failRecovery();
      }
    });
  }

  #failRecovery(): void {
    if (this.#closed || this.#recoveryState === "unavailable") return;
    this.#recoveryState = "unavailable";
    window.clearTimeout(this.#recoveryTimer);
    this.#recoveryNotice.replaceChildren(
      h(
        "span",
        {},
        "Recovery unavailable — local storage could not be used. Download to keep your work.",
      ),
    );
    this.#recoveryNotice.hidden = false;
  }

  #confirmReplace(action: string): boolean {
    if (!this.#dirty && !this.#downloadUnconfirmed) return true;
    return window.confirm(
      this.#dirty
        ? `The current SVG has unsaved changes. Continue to ${action} and replace them?`
        : `The last download could not be confirmed. Continue to ${action} and replace its recovery copy?`,
    );
  }

  #announce(message: string): void {
    this.#liveRegion.textContent = message;
  }
}
