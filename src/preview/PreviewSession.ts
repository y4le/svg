import type { ValidSvg } from "../document/validation";
import { hardenImportedSvg } from "../security/previewPolicy";

export type AnimationFamily = "none" | "css" | "smil" | "mixed";

export interface PlaybackState {
  readonly paused: boolean;
  readonly time: number;
  readonly family: AnimationFamily;
}

interface PreviewCallbacks {
  readonly onPlaybackChange: (state: PlaybackState) => void;
}

const TRUSTED_SHELL = `<!doctype html>
<html>
  <head>
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; media-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
    <style>
      html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; }
      body { display: grid; place-items: center; }
      body > svg { max-width: 100%; max-height: 100%; }
    </style>
  </head>
  <body></body>
</html>`;

function nextFrame(): Promise<void> {
  return new Promise((resolve) =>
    window.requestAnimationFrame(() => resolve()),
  );
}

export class PreviewSession {
  readonly iframe: HTMLIFrameElement;
  #ready: Promise<void>;
  #generation = 0;
  #paused: boolean;
  #time = 0;
  #family: AnimationFamily = "none";
  #callbacks: PreviewCallbacks;

  constructor(container: HTMLElement, callbacks: PreviewCallbacks) {
    this.#callbacks = callbacks;
    this.#paused = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    this.iframe = document.createElement("iframe");
    this.iframe.className = "preview-frame";
    this.iframe.title = "Rendered SVG preview";
    this.iframe.setAttribute("sandbox", "allow-same-origin");
    this.iframe.srcdoc = TRUSTED_SHELL;
    this.#ready = new Promise((resolve) => {
      this.iframe.addEventListener("load", () => resolve(), { once: true });
    });
    container.append(this.iframe);
  }

  get state(): PlaybackState {
    return { paused: this.#paused, time: this.#time, family: this.#family };
  }

  get document(): Document | null {
    return this.iframe.contentDocument;
  }

  get root(): SVGSVGElement | null {
    const root = this.document?.body.firstElementChild;
    return root?.localName === "svg" ? (root as SVGSVGElement) : null;
  }

  async publish(
    validation: ValidSvg,
    options: { restart?: boolean } = {},
  ): Promise<void> {
    const generation = ++this.#generation;
    await this.#ready;
    if (generation !== this.#generation) return;

    if (!options.restart) this.#captureTime();
    else this.#time = 0;

    const frameDocument = this.document;
    if (!frameDocument || !this.iframe.contentWindow)
      throw new Error("Preview frame is unavailable");

    const imported = frameDocument.importNode(
      validation.document.documentElement,
      true,
    );
    hardenImportedSvg(imported);
    frameDocument.body.replaceChildren(imported);
    await nextFrame();
    if (generation !== this.#generation) return;

    this.#detectFamily();
    this.#pauseClocks();
    this.#applyTime();
    if (!this.#paused) this.#playClocks();
    this.#emit();
  }

  pause(): void {
    this.#captureTime();
    this.#paused = true;
    this.#applyPauseState();
    this.#emit();
  }

  play(): void {
    this.#paused = false;
    this.#applyPauseState();
    this.#emit();
  }

  sampleTime(): number {
    this.#captureTime();
    return this.#time;
  }

  destroy(): void {
    this.#generation += 1;
    this.iframe.remove();
  }

  #animations(): Animation[] {
    return this.document?.getAnimations() ?? [];
  }

  #captureTime(): void {
    if (this.#family === "css") {
      const currentTime = this.#animations()[0]?.currentTime;
      if (typeof currentTime === "number") this.#time = currentTime / 1000;
      return;
    }

    const root = this.root;
    if (root) {
      try {
        this.#time = root.getCurrentTime();
        return;
      } catch {
        // Fall back to the first CSS/Web Animation clock.
      }
    }
    const fallbackTime = this.#animations()[0]?.currentTime;
    if (typeof fallbackTime === "number") this.#time = fallbackTime / 1000;
  }

  #applyTime(): void {
    const root = this.root;
    if (root) {
      try {
        root.setCurrentTime(this.#time);
      } catch {
        // Some engines expose SVG clock methods before the timeline is ready.
      }
    }
    for (const animation of this.#animations())
      animation.currentTime = this.#time * 1000;
  }

  #applyPauseState(): void {
    if (this.#paused) this.#pauseClocks();
    else this.#playClocks();
  }

  #pauseClocks(): void {
    try {
      this.root?.pauseAnimations();
    } catch {
      // Keep CSS animation controls useful if SMIL clock APIs are unavailable.
    }
    for (const animation of this.#animations()) animation.pause();
  }

  #playClocks(): void {
    try {
      this.root?.unpauseAnimations();
    } catch {
      // Keep CSS animation controls useful if SMIL clock APIs are unavailable.
    }
    for (const animation of this.#animations()) animation.play();
  }

  #detectFamily(): void {
    const hasSmil = Boolean(
      this.root?.querySelector("animate, animateMotion, animateTransform, set"),
    );
    const hasCss = this.#animations().length > 0;
    this.#family =
      hasSmil && hasCss ? "mixed" : hasSmil ? "smil" : hasCss ? "css" : "none";
  }

  #emit(): void {
    this.#callbacks.onPlaybackChange(this.state);
  }
}
