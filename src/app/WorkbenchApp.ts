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
      title: "Inspection horizon: 10 seconds",
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
      this.#fileInput,
      this.#recoveryNotice,
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
    void this.#offerRecovery();
  }

  destroy(): void {
    window.clearTimeout(this.#previewTimer);
    window.clearTimeout(this.#recoveryTimer);
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
    this.#pauseButton.textContent = state.paused ? "play" : "pause";
    this.#pauseButton.setAttribute(
      "aria-label",
      state.paused ? "Play animation" : "Pause animation",
    );
    this.#time.textContent = `${state.time.toFixed(2)}s`;
    this.#scrubber.value = String(
      Math.min(Number(this.#scrubber.max), state.time),
    );
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
    const bytes = this.#envelope.export(this.#source);
    const blob = new Blob([bytes.slice().buffer], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = this.#currentFilename;
    link.click();
    URL.revokeObjectURL(url);

    this.#envelope = FileEnvelope.fromBytes(link.download, bytes);
    this.#baselineSource = this.#source;
    this.#baselineFilename = this.#currentFilename;
    this.#syncDirtyState();
    this.#renderDirtyStatus();
    void clearRecovery();
    this.#announce(`${link.download} downloaded.`);
  }

  #scheduleRecovery(): void {
    window.clearTimeout(this.#recoveryTimer);
    this.#recoveryTimer = window.setTimeout(() => {
      if (!this.#dirty) {
        void clearRecovery();
        return;
      }
      void saveRecovery({
        source: this.#source,
        baseline: this.#baselineSource,
        filename: this.#currentFilename,
        baselineFilename: this.#baselineFilename,
        originalBytes: this.#envelope.export(this.#envelope.source),
        updatedAt: Date.now(),
      });
    }, 350);
  }

  async #offerRecovery(): Promise<void> {
    const recovery = await loadRecovery().catch(() => undefined);
    if (!recovery) return;
    const baselineFilename = recovery.baselineFilename ?? recovery.filename;
    if (
      recovery.source === recovery.baseline &&
      recovery.filename === baselineFilename
    ) {
      return;
    }
    const age = new Date(recovery.updatedAt).toLocaleString();
    this.#recoveryNotice.hidden = false;
    this.#recoveryNotice.replaceChildren(
      h("span", {}, `Unsaved ${recovery.filename} from ${age}`),
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
    if (!this.#confirmReplace(`restore ${recovery.filename}`)) return;
    const envelope = FileEnvelope.fromBytes(
      recovery.baselineFilename ?? recovery.filename,
      recovery.originalBytes,
    );
    this.#recoveryNotice.hidden = true;
    this.#loadEnvelope(envelope, recovery.source, recovery.filename);
    this.#announce("Unsaved SVG restored.");
  }

  async #discardRecovery(): Promise<void> {
    await clearRecovery();
    this.#recoveryNotice.hidden = true;
    this.#announce("Recovered draft discarded.");
  }

  #confirmReplace(action: string): boolean {
    return (
      !this.#dirty ||
      window.confirm(
        `The current SVG has unsaved changes. Continue to ${action} and replace them?`,
      )
    );
  }

  #announce(message: string): void {
    this.#liveRegion.textContent = message;
  }
}
