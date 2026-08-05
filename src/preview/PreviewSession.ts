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

    const expectedCss =
      this.#family === "css" ||
      this.#family === "mixed" ||
      [...validation.document.querySelectorAll("style")].some((style) =>
        /(?:^|[;{\s])animation(?:-name)?\s*:/i.test(style.textContent ?? ""),
      );
    if (!options.restart) this.#captureTime();
    else this.#time = 0;
    const restoreTime = this.#time;

    const frameDocument = this.document;
    if (!frameDocument || !this.iframe.contentWindow)
      throw new Error("Preview frame is unavailable");

    const imported = frameDocument.importNode(
      validation.document.documentElement,
      true,
    );
    hardenImportedSvg(imported);
    frameDocument.body.replaceChildren(imported);
    await this.#nextFrame();
    if (generation !== this.#generation) return;

    const familyReady = await this.#detectFamily(generation, expectedCss);
    if (!familyReady || generation !== this.#generation) return;
    this.#pauseClocks();
    const restored = await this.#settleTime(generation, restoreTime);
    if (generation !== this.#generation) return;
    if (!restored)
      throw new Error("The preview animation clock could not be restored.");
    if (!this.#paused) {
      this.#playClocks();
      // Firefox resets a newly inserted SMIL/CSS timeline when it first starts,
      // even if a paused seek appeared to succeed. Seek again while the clocks
      // are live and verify the result before exposing the new generation.
      const playingRestored = await this.#settleTime(
        generation,
        restoreTime,
        0.08,
        true,
      );
      if (generation !== this.#generation) return;
      if (!playingRestored)
        throw new Error(
          "The live preview animation clock could not be restored.",
        );
    }
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

  seek(time: number): void {
    this.#time = Math.max(0, time);
    this.#applyTime();
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

  #applyTime(running = false, time = this.#time): void {
    const root = this.root;
    if (root) {
      try {
        root.setCurrentTime(time);
      } catch {
        // Some engines expose SVG clock methods before the timeline is ready.
      }
    }
    for (const animation of this.#animations()) {
      const timelineTime = animation.timeline?.currentTime;
      if (running && typeof timelineTime === "number") {
        // Resolving the pending play task through startTime avoids Firefox
        // discarding a currentTime assignment when a CSS animation starts.
        animation.startTime = timelineTime - time * 1000;
      } else {
        animation.currentTime = time * 1000;
      }
    }
  }

  async #settleTime(
    generation: number,
    target: number,
    tolerance = 0.03,
    running = false,
  ): Promise<boolean> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      this.#time = target;
      this.#applyTime(running, target);
      await this.#nextFrame();
      if (generation !== this.#generation) return false;
      if (this.#timeIsSettled(target, tolerance, running)) {
        this.#time = target;
        return true;
      }
    }
    return false;
  }

  #timeIsSettled(target: number, tolerance: number, running: boolean): boolean {
    if (this.#family === "smil" || this.#family === "mixed") {
      try {
        const current = this.root?.getCurrentTime();
        if (
          typeof current !== "number" ||
          (running
            ? current < target - tolerance
            : Math.abs(current - target) > tolerance)
        )
          return false;
      } catch {
        return false;
      }
    }

    if (this.#family === "css" || this.#family === "mixed") {
      const animations = this.#animations();
      if (animations.length === 0) return false;
      for (const animation of animations) {
        const current = animation.currentTime;
        if (
          typeof current !== "number" ||
          (running
            ? current / 1000 < target - tolerance
            : Math.abs(current / 1000 - target) > tolerance)
        )
          return false;
      }
    }

    return true;
  }

  #nextFrame(): Promise<void> {
    // WebKit may suspend requestAnimationFrame inside a script-disabled
    // sandbox document. The parent frame still advances the embedded render
    // lifecycle without relying on authored-preview script capability.
    return new Promise((resolve) =>
      window.requestAnimationFrame(() => resolve()),
    );
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

  async #detectFamily(
    generation: number,
    expectedCss: boolean,
  ): Promise<boolean> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const hasSmil = Boolean(
        this.root?.querySelector(
          "animate, animateMotion, animateTransform, set",
        ),
      );
      const hasCss = this.#animations().length > 0;
      this.#family =
        hasSmil && hasCss
          ? "mixed"
          : hasSmil
            ? "smil"
            : hasCss
              ? "css"
              : "none";
      if (!expectedCss || hasCss) return true;
      await this.#nextFrame();
      if (generation !== this.#generation) return false;
    }
    return generation === this.#generation;
  }

  #emit(): void {
    this.#callbacks.onPlaybackChange(this.state);
  }
}
