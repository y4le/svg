import type { EditorView } from "@codemirror/view";
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

  constructor(mount: HTMLElement) {
    const editorHost = h("div", { className: "editor-host" });
    const previewStage = h("div", { className: "preview-stage" });

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
        h("div", { className: "breadcrumb" }, "no selection"),
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
    this.editor = createEditor({
      parent: editorHost,
      document: this.#source,
      onChange: (source) => this.#onSourceChange(source),
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
    void this.preview.publish(validation).catch((error: unknown) => {
      this.#status.textContent = "preview failed";
      this.#status.classList.add("status-error");
      this.#showDiagnostic(
        error instanceof Error ? error.message : "Preview failed.",
        false,
      );
    });
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
        this.#lastClockPaint = timestamp;
      }
      this.#clockFrame = window.requestAnimationFrame(tick);
    };
    this.#clockFrame = window.requestAnimationFrame(tick);
  }

  #stopClock(): void {
    window.cancelAnimationFrame(this.#clockFrame ?? 0);
    this.#clockFrame = undefined;
  }

  #announce(message: string): void {
    this.#liveRegion.textContent = message;
  }
}
