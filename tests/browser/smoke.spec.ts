import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

async function replaceSource(page: Page, source: string): Promise<void> {
  const editor = page.locator(".cm-content");
  await editor.click();
  await editor.fill(source);
}

function collectUnexpectedConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !message.text().includes("Blocked script execution in 'about:srcdoc'")
    ) {
      errors.push(message.text());
    }
  });
  return errors;
}

test("renders a mixed-animation document with browser geometry APIs", async ({
  page,
}) => {
  const errors = collectUnexpectedConsoleErrors(page);
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "source" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "preview" })).toBeVisible();
  await expect(
    page.getByText("yalethom.as/svg", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Rename orbit-pulse.svg" }),
  ).toBeVisible();
  await expect(page.getByTestId("document-status")).toContainText("valid");
  await expect(page.getByText(/mixed animation/i)).toBeVisible();
  await expect(
    page.getByRole("group", { name: "Playback and file actions" }),
  ).toBeVisible();
  await expect(page.getByRole("timer", { name: "Preview time" })).toBeVisible();

  const capabilities = await page
    .locator("iframe")
    .evaluate((frame: HTMLIFrameElement) => {
      const documentNode = frame.contentDocument;
      const root = documentNode?.querySelector("svg") as SVGSVGElement | null;
      const circle = documentNode?.querySelector(
        "circle",
      ) as SVGCircleElement | null;
      return {
        namespace: root?.namespaceURI,
        animations: documentNode?.getAnimations().length ?? 0,
        currentTime: root?.getCurrentTime(),
        width: circle?.getBBox().width,
        matrix: circle?.getScreenCTM()?.a,
      };
    });

  expect(capabilities.namespace).toBe(SVG_NAMESPACE);
  expect(capabilities.animations).toBeGreaterThan(0);
  expect(capabilities.currentTime).toEqual(expect.any(Number));
  expect(capabilities.width).toBeGreaterThan(0);
  expect(capabilities.matrix).toEqual(expect.any(Number));
  expect(errors).toEqual([]);
});

test("keeps the public shell policy compatible with the SVG instrument", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const scope = window as typeof window & { __cspViolations: string[] };
    scope.__cspViolations = [];
    window.addEventListener("securitypolicyviolation", (event) => {
      scope.__cspViolations.push(
        `${event.violatedDirective}|${event.blockedURI}`,
      );
    });
  });
  await page.goto("/");

  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    "A source-first browser workbench for inspecting and tuning SVG without surrendering the code.",
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://yalethom.as/svg/",
  );
  const policy = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute("content");
  expect(policy).toContain("default-src 'none'");
  expect(policy).toContain("script-src 'self'");
  expect(policy).toContain("worker-src 'none'");

  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const image = new Image();
        image.onload = image.onerror = () => resolve();
        image.src = "https://example.com/svg-workbench-csp-probe.png";
      }),
  );
  const blockedProbe = await page.evaluate(
    () =>
      (window as typeof window & { __cspViolations: string[] }).__cspViolations,
  );
  expect(
    blockedProbe.some((violation) => violation.startsWith("img-src|")),
  ).toBe(true);
  await page.evaluate(() => {
    (window as typeof window & { __cspViolations: string[] }).__cspViolations =
      [];
  });

  const iconUrl = await page
    .locator('link[rel="icon"]')
    .evaluate((link: HTMLLinkElement) => link.href);
  expect((await page.request.get(iconUrl)).ok()).toBe(true);

  await replaceSource(
    page,
    `<svg xmlns="${SVG_NAMESPACE}" viewBox="0 0 100 100">
      <style>
        @keyframes drift { to { transform: translateX(4px); } }
        .css-motion { animation: drift 1s linear infinite; }
      </style>
      <rect class="css-motion" style="fill: #c1432e" x="10" y="10" width="20" height="20" />
      <circle cx="50" cy="50" r="10">
        <animate attributeName="r" values="8;12;8" dur="1s" repeatCount="indefinite" />
      </circle>
      <image href="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxyZWN0IHdpZHRoPSIxIiBoZWlnaHQ9IjEiLz48L3N2Zz4=" width="1" height="1" />
    </svg>`,
  );
  await expect
    .poll(() =>
      page
        .locator("iframe")
        .evaluate((frame: HTMLIFrameElement) =>
          Boolean(frame.contentDocument?.querySelector(".css-motion")),
        ),
    )
    .toBe(true);
  await expect(page.getByText(/mixed animation/i)).toBeVisible();
  expect(
    await page.locator("iframe").evaluate((frame: HTMLIFrameElement) => {
      const rect = frame.contentDocument?.querySelector("rect");
      return {
        cssAnimations: frame.contentDocument?.getAnimations().length ?? 0,
        smilTime: (
          frame.contentDocument?.querySelector("svg") as SVGSVGElement | null
        )?.getCurrentTime(),
        inlineFill:
          rect && frame.contentWindow
            ? frame.contentWindow.getComputedStyle(rect).fill
            : null,
      };
    }),
  ).toEqual({
    cssAnimations: 1,
    smilTime: expect.any(Number),
    inlineFill: "rgb(193, 67, 46)",
  });

  await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "download" }).click(),
  ]);
  await page.waitForTimeout(100);
  expect(
    await page.locator("iframe").evaluate(
      (frame: HTMLIFrameElement) =>
        (
          frame.contentWindow as typeof window & {
            __cspViolations: string[];
          }
        ).__cspViolations,
    ),
  ).toEqual([]);
  expect(
    await page.evaluate(
      () =>
        (window as typeof window & { __cspViolations: string[] })
          .__cspViolations,
    ),
  ).toEqual([]);
});

test("derives the bundled inspection horizon from its longest CSS iteration", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("document-status")).toHaveText("valid");
  await expect(page.getByLabel("Inspection time")).toHaveAttribute("max", "4");
  const horizon = page.locator("#inspection-horizon");
  await expect(horizon).toHaveText("horizon 4.00s · longest CSS iteration");
  await expect(horizon).toHaveCSS("color", "rgb(141, 138, 129)");
  expect(
    await horizon.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 900, height: 720 });
  await expect(page.getByRole("button", { name: "download" })).toBeInViewport({
    ratio: 1,
  });
  await expect(horizon).toHaveCSS("text-overflow", "ellipsis");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    )
    .toBe(true);
});

test("reaches a long finite SMIL horizon", async ({ page }) => {
  await page.goto("/");
  await replaceSource(
    page,
    `<svg xmlns="${SVG_NAMESPACE}" viewBox="0 0 100 100">
      <circle cy="50" r="10">
        <animate attributeName="cx" from="10" to="90" dur="30s" />
      </circle>
    </svg>`,
  );

  const scrubber = page.getByLabel("Inspection time");
  await expect(scrubber).toHaveAttribute("max", "30");
  await expect(page.locator("#inspection-horizon")).toHaveText(
    "horizon 30.00s · longest SMIL timing",
  );
  await page.getByRole("button", { name: "Pause animation" }).click();
  await scrubber.fill("30");
  await expect(page.getByLabel("Preview time")).toHaveText("30.00s");
});

test("distinguishes static and unresolved fallback horizons", async ({
  page,
}) => {
  await page.goto("/");
  const horizon = page.locator("#inspection-horizon");
  const scrubber = page.getByLabel("Inspection time");

  await replaceSource(
    page,
    `<svg xmlns="${SVG_NAMESPACE}" viewBox="0 0 100 100"><rect width="100" height="100" /></svg>`,
  );
  await expect(scrubber).toHaveAttribute("max", "10");
  await expect(horizon).toHaveText("horizon 10s · no animation timing");

  await replaceSource(
    page,
    `<svg xmlns="${SVG_NAMESPACE}" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="10">
        <animate attributeName="opacity" begin="click" dur="indefinite" />
      </circle>
    </svg>`,
  );
  await expect(scrubber).toHaveAttribute("max", "10");
  await expect(horizon).toHaveText(
    "horizon 10s · indefinite or event-driven timing",
  );
});

test("updates and clamps the scrubber when a replacement horizon shrinks", async ({
  page,
}) => {
  await page.goto("/");
  await replaceSource(
    page,
    `<svg xmlns="${SVG_NAMESPACE}" viewBox="0 0 100 100">
      <circle cy="50" r="10">
        <animate attributeName="cx" from="10" to="90" dur="30s" />
      </circle>
    </svg>`,
  );
  await page.getByRole("button", { name: "Pause animation" }).click();
  const scrubber = page.getByLabel("Inspection time");
  await expect(scrubber).toHaveAttribute("max", "30");
  await scrubber.fill("25");

  await replaceSource(
    page,
    `<svg xmlns="${SVG_NAMESPACE}" viewBox="0 0 100 100">
      <circle cy="50" r="10">
        <animate attributeName="cx" from="10" to="90" dur="1s" />
      </circle>
    </svg>`,
  );
  await expect(scrubber).toHaveAttribute("max", "1");
  await expect(scrubber).toHaveValue("1");
  await expect(page.getByLabel("Preview time")).toHaveText("25.00s");
});

test("pauses and restarts CSS and SMIL clocks", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("document-status")).toContainText("valid");

  await expect
    .poll(async () =>
      Number.parseFloat((await page.getByRole("timer").textContent()) ?? "0"),
    )
    .toBeGreaterThan(0.1);

  await page.getByRole("button", { name: "Pause animation" }).click();
  await expect(
    page.getByRole("button", { name: "Play animation" }),
  ).toBeVisible();

  const paused = await page
    .locator("iframe")
    .evaluate((frame: HTMLIFrameElement) => {
      const documentNode = frame.contentDocument;
      const root = documentNode?.querySelector("svg") as SVGSVGElement | null;
      return {
        css: documentNode
          ?.getAnimations()
          .map((animation) => animation.playState),
        smil: root?.animationsPaused(),
      };
    });
  expect(paused.css).toEqual(["paused"]);
  expect(paused.smil).toBe(true);

  await page.getByRole("button", { name: "restart" }).click();
  await expect(page.getByLabel("Preview time")).toHaveText("0.00s");
});

test("preserves the mixed animation clock through an ordinary source edit", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("document-status")).toHaveText("valid");
  await page.waitForTimeout(450);

  const before = await page
    .locator("iframe")
    .evaluate((frame: HTMLIFrameElement) => {
      const root = frame.contentDocument?.querySelector("svg") as
        (SVGSVGElement & { __oldRoot?: boolean }) | null;
      if (root) root.__oldRoot = true;
      return root?.getCurrentTime() ?? 0;
    });

  const editor = page.locator(".cm-content");
  await editor.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.insertText("\n");
  await expect(page.getByTestId("document-status")).toContainText("changed");
  await expect
    .poll(() =>
      page
        .locator("iframe")
        .getAttribute("data-source-version")
        .then((version) => version === "1"),
    )
    .toBe(true);

  const after = await page
    .locator("iframe")
    .evaluate((frame: HTMLIFrameElement) => {
      const documentNode = frame.contentDocument;
      const root = documentNode?.querySelector("svg") as SVGSVGElement | null;
      return {
        smil: root?.getCurrentTime() ?? 0,
        css: Number(documentNode?.getAnimations()[0]?.currentTime ?? 0) / 1000,
      };
    });
  expect(after.smil).toBeGreaterThanOrEqual(before - 0.15);
  expect(Math.abs(after.smil - after.css)).toBeLessThan(0.15);
});

test("uses the CSS animation clock for CSS-only documents", async ({
  page,
}) => {
  const cssOnly = `<svg xmlns="${SVG_NAMESPACE}" viewBox="0 0 100 100">
    <style>@keyframes spin { to { transform: rotate(360deg) } } rect { transform-origin: 50px 50px; animation: spin 4s linear infinite }</style>
    <rect x="20" y="20" width="60" height="60" />
  </svg>`;
  await page.goto("/");
  await replaceSource(page, cssOnly);
  await expect(page.getByText(/CSS animation/i)).toBeVisible();

  const first = Number.parseFloat(
    (await page.getByRole("timer").textContent()) ?? "0",
  );
  await expect
    .poll(async () =>
      Number.parseFloat((await page.getByRole("timer").textContent()) ?? "0"),
    )
    .toBeGreaterThan(first + 0.25);

  const before = await page
    .locator("iframe")
    .evaluate((frame: HTMLIFrameElement) =>
      Number(frame.contentDocument?.getAnimations()[0]?.currentTime ?? 0),
    );
  const editor = page.locator(".cm-content");
  await editor.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.insertText("\n");
  await expect(page.getByTestId("document-status")).toContainText("changed");
  await expect(page.locator("iframe")).toHaveAttribute(
    "data-source-version",
    "2",
  );
  const after = await page
    .locator("iframe")
    .evaluate((frame: HTMLIFrameElement) =>
      Number(frame.contentDocument?.getAnimations()[0]?.currentTime ?? 0),
    );
  expect(after).toBeGreaterThanOrEqual(before - 150);
});

test("keeps the last valid preview while edited source is invalid", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("document-status")).toContainText("valid");

  const frameRoot = page.frameLocator("iframe").locator("svg");
  await expect(frameRoot).toBeVisible();
  await replaceSource(
    page,
    '<svg xmlns="http://www.w3.org/2000/svg"><g></svg>',
  );

  await expect(page.getByTestId("document-status")).toContainText("stale");
  await expect(page.getByTestId("diagnostic")).toContainText(
    "last valid source",
  );
  await expect(page.getByTestId("diagnostic")).not.toContainText(
    "Below is a rendering",
  );
  await expect(page.getByTestId("diagnostic")).not.toContainText(
    "http://127.0.0.1",
  );
  await expect(frameRoot).toBeVisible();
});

test("diagnoses a namespace-less SVG instead of silently rendering it", async ({
  page,
}) => {
  await page.goto("/");
  await replaceSource(page, '<svg viewBox="0 0 10 10"><circle r="4" /></svg>');

  await expect(page.getByTestId("document-status")).toContainText("stale");
  await expect(page.getByTestId("diagnostic")).toContainText(
    'xmlns="http://www.w3.org/2000/svg"',
  );
});

test("allows DOCTYPE text in content but rejects an actual prolog declaration", async ({
  page,
}) => {
  await page.goto("/");
  await replaceSource(
    page,
    `<svg xmlns="${SVG_NAMESPACE}"><!-- <!DOCTYPE html> --><text>&lt;!DOCTYPE html&gt;</text></svg>`,
  );
  await expect(page.getByTestId("document-status")).toContainText("valid");

  await replaceSource(
    page,
    `<!DOCTYPE svg><svg xmlns="${SVG_NAMESPACE}" viewBox="0 0 10 10" />`,
  );
  await expect(page.getByTestId("document-status")).toContainText("stale");
  await expect(page.getByTestId("diagnostic")).toContainText(
    "DOCTYPE declarations",
  );
});

test("blocks authored scripts, handlers, external loads, and navigation", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.url().startsWith("https://example.invalid"))
      requests.push(request.url());
  });
  await page.goto("/");

  await replaceSource(
    page,
    `<svg xmlns="${SVG_NAMESPACE}" viewBox="0 0 100 100">
      <style>
        @import"https://example.invalid/theme.css";
        rect { filter: url("https://example.invalid/filter.svg#blur"); }
      </style>
      <script>parent.__svgPwned = true</script>
      <image href="https://example.invalid/tracker.png" width="10" height="10" />
      <foreignObject width="10" height="10"><img xmlns="http://www.w3.org/1999/xhtml" srcset="https://example.invalid/twice.png 2x" /></foreignObject>
      <a href="https://example.invalid/escape"><rect width="100" height="100" style="mask: url(https://example.invalid/mask.svg#m)" onload="parent.__svgPwned = true" /></a>
    </svg>`,
  );

  await expect(page.getByTestId("document-status")).toContainText("valid");
  await expect(
    page.getByText(
      /blocked: 1 script · 1 handler · 6 resource references · 1 navigation link/,
    ),
  ).toBeVisible();
  const initialUrl = page.url();
  const link = await page
    .locator("iframe")
    .evaluate((frame: HTMLIFrameElement) => {
      const rect = frame.contentDocument
        ?.querySelector("a")
        ?.getBoundingClientRect();
      return rect
        ? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
        : null;
    });
  expect(link).not.toBeNull();
  await page.locator(".preview-inspector").click({ position: link! });
  expect(page.url()).toBe(initialUrl);
  expect(
    await page
      .locator("iframe")
      .evaluate(
        (frame: HTMLIFrameElement) => frame.contentWindow?.location.href,
      ),
  ).toBe("about:srcdoc");
  expect(
    await page
      .locator("iframe")
      .evaluate(
        (frame: HTMLIFrameElement) =>
          frame.contentDocument?.querySelectorAll("a[href]").length,
      ),
  ).toBe(0);
  expect(
    await page.evaluate(
      () =>
        (window as typeof window & { __svgPwned?: boolean }).__svgPwned ??
        false,
    ),
  ).toBe(false);
  expect(requests).toEqual([]);
});

test("starts preview motion paused when reduced motion is preferred", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  await expect(
    page.getByRole("button", { name: "Play animation" }),
  ).toBeVisible();
  const playStates = await page
    .locator("iframe")
    .evaluate(
      (frame: HTMLIFrameElement) =>
        frame.contentDocument
          ?.getAnimations()
          .map((animation) => animation.playState) ?? [],
    );
  expect(playStates).toEqual(["paused"]);
});

test("keeps pause and restart visible on a narrow viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 700, height: 800 });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Pause animation" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "restart" })).toBeVisible();
  await expect(page.getByRole("button", { name: "open" })).toBeHidden();
  await expect(page.getByRole("button", { name: "download" })).toBeHidden();
});

test("links source positions and rendered elements through one selection", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("document-status")).toHaveText("valid");
  await page.getByRole("button", { name: "Pause animation" }).click();

  await page
    .locator(".cm-line")
    .nth(22)
    .click({ position: { x: 120, y: 8 } });
  await expect(page.locator(".breadcrumb")).toContainText("circle#dot");
  await expect(page.getByTestId("selection-box")).toBeVisible();

  const dot = await page
    .locator("iframe")
    .evaluate((frame: HTMLIFrameElement) => {
      const rect = frame.contentDocument
        ?.querySelector("#dot")
        ?.getBoundingClientRect();
      return rect
        ? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
        : null;
    });
  expect(dot).not.toBeNull();
  await page.locator(".preview-inspector").click({ position: dot! });

  await expect(page.locator(".breadcrumb")).toContainText(
    "svg›g#orbit›circle#dot",
  );
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(
    "circle",
  );

  await page.locator(".preview-inspector").click({
    position: dot!,
    modifiers: ["Shift"],
  });
  await expect(page.locator(".breadcrumb")).toContainText("svg›g#orbit");
});

test("does not remeasure an unchanged source selection", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("document-status")).toHaveText("valid");
  await page.getByRole("button", { name: "Pause animation" }).click();

  const dotLine = page.locator(".cm-line").nth(22);
  await dotLine.click({ position: { x: 120, y: 8 } });
  await expect(page.locator(".breadcrumb")).toContainText("circle#dot");
  await expect(page.getByTestId("selection-box")).toBeVisible();

  const inspector = page.getByRole("listbox", { name: "Rendered elements" });
  const before = {
    activeOption: await inspector.getAttribute("aria-activedescendant"),
    breadcrumb: await page.locator(".breadcrumb").textContent(),
    boxStyle: await page.getByTestId("selection-box").getAttribute("style"),
  };
  await page.locator("iframe").evaluate((frame: HTMLIFrameElement) => {
    const documentNode = frame.contentDocument;
    if (!documentNode) throw new Error("Expected preview document");
    const root = documentNode.documentElement;
    root.setAttribute("data-selection-rect-reads", "0");
    for (const element of documentNode.querySelectorAll("*")) {
      const original = element.getBoundingClientRect.bind(element);
      element.getBoundingClientRect = () => {
        const reads = Number(
          root.getAttribute("data-selection-rect-reads") ?? "0",
        );
        root.setAttribute("data-selection-rect-reads", String(reads + 1));
        return original();
      };
    }
  });

  await dotLine.click({ position: { x: 180, y: 8 } });
  expect(
    await page.locator("iframe").evaluate((frame: HTMLIFrameElement) => {
      return Number(
        frame.contentDocument?.documentElement.getAttribute(
          "data-selection-rect-reads",
        ) ?? "0",
      );
    }),
  ).toBe(0);
  await expect(inspector).toHaveAttribute(
    "aria-activedescendant",
    before.activeOption ?? "",
  );
  await expect(page.locator(".breadcrumb")).toHaveText(before.breadcrumb ?? "");
  await expect(page.getByTestId("selection-box")).toHaveAttribute(
    "style",
    before.boxStyle ?? "",
  );

  await page
    .locator(".cm-line")
    .nth(20)
    .click({ position: { x: 120, y: 8 } });
  await expect(page.locator(".breadcrumb")).toContainText("circle.guide");
  await expect(inspector).not.toHaveAttribute(
    "aria-activedescendant",
    before.activeOption ?? "",
  );
  await expect
    .poll(() =>
      page.locator("iframe").evaluate((frame: HTMLIFrameElement) => {
        return Number(
          frame.contentDocument?.documentElement.getAttribute(
            "data-selection-rect-reads",
          ) ?? "0",
        );
      }),
    )
    .toBeGreaterThan(0);
});

test("walks rendered elements by keyboard and hands focus back to source", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("document-status")).toHaveText("valid");
  await page.getByRole("button", { name: "Pause animation" }).click();

  const inspector = page.getByRole("listbox", { name: "Rendered elements" });
  const option = page.getByRole("option");
  await expect(inspector).toHaveAttribute("tabindex", "0");
  await expect(page.locator("iframe")).toHaveAttribute("tabindex", "-1");
  await page.locator(".cm-content").focus();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Tab");
  await expect(inspector).toBeFocused();
  await expect(inspector).toHaveCSS("outline-style", "solid");
  await expect(option).toHaveAttribute("aria-posinset", "1");
  await expect(option).toHaveAttribute("aria-setsize", "8");

  await inspector.press("End");
  await expect(option).toHaveAttribute("aria-posinset", "8");
  await inspector.press("Home");
  await expect(option).toHaveAttribute("aria-posinset", "1");

  await inspector.press("ArrowDown");
  await expect(option).toHaveText("style, no rendered geometry");
  await expect(option).toHaveAttribute("aria-posinset", "2");
  await expect(page.getByTestId("selection-box")).toBeHidden();
  await expect(page.locator(".breadcrumb")).toContainText("svg›style");
  await expect(page.locator(".cm-activeLine")).toContainText("<style>");
  await expect(inspector).toBeFocused();
  await expect(page.locator("#live-region")).toBeEmpty();

  await inspector.press("ArrowDown");
  await expect(option).toHaveText("rect");
  await expect(option).toHaveAttribute("aria-posinset", "3");
  await expect(page.getByTestId("selection-box")).toBeVisible();
  await expect(page.locator(".cm-activeLine")).toContainText("<rect");
  await expect(inspector).toBeFocused();

  await inspector.press("Shift+ArrowUp");
  await expect(option).toHaveText("svg");
  await expect(option).toHaveAttribute("aria-posinset", "1");
  await inspector.press("ArrowRight");
  await expect(option).toHaveText("style, no rendered geometry");
  const activeOption = await inspector.getAttribute("aria-activedescendant");
  expect(activeOption).toBe(await option.getAttribute("id"));

  await inspector.press("Enter");
  await expect(page.locator(".cm-content")).toBeFocused();
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(
    "style",
  );
});

test("announces when keyboard preview selection is unavailable", async ({
  page,
}) => {
  await page.goto("/");
  await replaceSource(
    page,
    `<svg xmlns="${SVG_NAMESPACE}" viewBox="0 0 10 10"><g></svg>`,
  );
  await expect(page.getByTestId("document-status")).toContainText("stale");

  const inspector = page.getByRole("listbox", { name: "Rendered elements" });
  await inspector.focus();
  await inspector.press("ArrowDown");
  await expect(page.locator("#live-region")).toHaveText(
    "Preview is held at the last valid source; selection is unavailable.",
  );
  await expect(inspector).not.toHaveAttribute("aria-activedescendant", /.+/);
  await expect(page.getByRole("option")).toHaveAttribute(
    "aria-selected",
    "false",
  );
});

test("keeps a paused selection outline aligned after preview resize", async ({
  page,
}) => {
  const errors = collectUnexpectedConsoleErrors(page);
  await page.goto("/");
  await expect(page.getByTestId("document-status")).toHaveText("valid");
  await page.getByRole("button", { name: "Pause animation" }).click();
  await page
    .locator(".cm-line")
    .nth(22)
    .click({ position: { x: 120, y: 8 } });
  await expect(page.locator(".breadcrumb")).toContainText("circle#dot");

  const alignmentError = (): Promise<number> =>
    page.locator("iframe").evaluate((frame: HTMLIFrameElement) => {
      const frameRect = frame.getBoundingClientRect();
      const elementRect = frame.contentDocument
        ?.querySelector("#dot")
        ?.getBoundingClientRect();
      const boxRect = frame.ownerDocument
        .querySelector("[data-testid=selection-box]")
        ?.getBoundingClientRect();
      if (!elementRect || !boxRect) return Infinity;
      return Math.max(
        Math.abs(boxRect.left - (frameRect.left + elementRect.left)),
        Math.abs(boxRect.top - (frameRect.top + elementRect.top)),
        Math.abs(boxRect.width - elementRect.width),
        Math.abs(boxRect.height - elementRect.height),
      );
    });

  await expect.poll(alignmentError).toBeLessThan(0.75);
  const before = await page.getByTestId("selection-box").boundingBox();
  await page.setViewportSize({ width: 1000, height: 720 });
  await expect.poll(alignmentError).toBeLessThan(0.75);
  const after = await page.getByTestId("selection-box").boundingBox();
  expect(after?.x).not.toBeCloseTo(before?.x ?? 0, 0);
  expect(errors).toEqual([]);
});

test("edits root variables in source and shows sliders only for authored bounds", async ({
  page,
}) => {
  await page.goto("/");
  const dotRange = page.getByLabel("dot size range");
  await expect(dotRange).toBeVisible();
  await expect(page.getByLabel("period range")).toBeVisible();
  await expect(page.getByLabel("ink range")).toHaveCount(0);
  await expect(page.getByLabel("dot size value")).toHaveAttribute(
    "spellcheck",
    "false",
  );

  await dotRange.fill("12");
  await expect(page.getByTestId("document-status")).toContainText(
    "valid · changed",
  );
  await expect(page.locator(".cm-content")).toContainText("--dot-size: 12px");
  await expect(page.getByLabel("dot size value")).toHaveValue("12px");
  const dotWidth = await page
    .locator("iframe")
    .evaluate(
      (frame: HTMLIFrameElement) =>
        (
          frame.contentDocument?.querySelector(
            "#dot",
          ) as SVGGraphicsElement | null
        )?.getBBox().width,
    );
  expect(dotWidth).toBeCloseTo(24, 0);

  const ink = page.getByLabel("ink value");
  await ink.fill("#00ff00");
  await ink.press("Tab");
  await expect(page.locator(".cm-content")).toContainText("--ink: #00ff00");
});

test("refuses a variable edit built against a superseded source version", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".variable-value")).toHaveCount(4);

  const outcome = await page.evaluate(() => {
    const [first, second] = [
      ...document.querySelectorAll<HTMLInputElement>(".variable-value"),
    ];
    if (!first || !second) throw new Error("Expected two variable controls");
    const before = second.value;
    first.value = "12px";
    first.dispatchEvent(new Event("change", { bubbles: true }));
    second.value = "7s";
    second.dispatchEvent(new Event("change", { bubbles: true }));
    return { before, after: second.value };
  });

  expect(outcome.after).toBe(outcome.before);
  await expect(page.locator("#live-region")).toHaveText(/source changed/i);
  await expect(page.locator(".cm-content")).toContainText("--dot-size: 12px");
  await expect(page.locator(".cm-content")).not.toContainText("--period: 7s");

  await expect(page.locator("iframe")).toHaveAttribute(
    "data-source-version",
    "1",
  );
  const rearmed = page.locator(".variable-value").nth(1);
  await rearmed.fill("7s");
  await rearmed.press("Tab");
  await expect(page.locator(".cm-content")).toContainText("--period: 7s");
});

test("refuses a stale slider gesture once and leaves source untouched", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByLabel("dot size range")).toBeVisible();

  const outcome = await page.evaluate(async () => {
    const period = document.querySelector<HTMLInputElement>(
      '[aria-label="period value"]',
    );
    const slider = document.querySelector<HTMLInputElement>(
      '[aria-label="dot size range"]',
    );
    const live = document.querySelector("#live-region");
    if (!period || !slider || !live)
      throw new Error("Expected variable controls and live region");
    const announcements: string[] = [];
    const observer = new MutationObserver(() => {
      announcements.push(live.textContent ?? "");
    });
    observer.observe(live, {
      childList: true,
      characterData: true,
      subtree: true,
    });

    period.value = "2s";
    period.dispatchEvent(new Event("change", { bubbles: true }));
    slider.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, pointerId: 17 }),
    );
    slider.value = "12";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    slider.value = "14";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    slider.dispatchEvent(
      new PointerEvent("pointerup", { bubbles: true, pointerId: 17 }),
    );
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
    observer.disconnect();
    return {
      announcements: announcements.filter((message) =>
        message.includes("variable edit was not applied"),
      ).length,
      sliderValue: slider.value,
    };
  });

  expect(outcome).toEqual({ announcements: 1, sliderValue: "9" });
  await expect(page.locator(".cm-content")).toContainText("--period: 2s");
  await expect(page.locator(".cm-content")).toContainText("--dot-size: 9px");
  await expect(page.locator(".cm-content")).not.toContainText(
    "--dot-size: 14px",
  );
});

test("coalesces a slider pointer gesture into one undo step", async ({
  page,
}) => {
  await page.goto("/");
  const slider = page.getByLabel("dot size range");
  await expect(slider).toBeVisible();
  await slider.evaluate((element: HTMLInputElement) => {
    element.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, pointerId: 7 }),
    );
    element.value = "13";
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.value = "15";
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(
      new PointerEvent("pointerup", { bubbles: true, pointerId: 7 }),
    );
  });
  await expect(page.locator(".cm-content")).toContainText("--dot-size: 15px");

  await page.locator(".cm-content").click();
  await page.keyboard.press("Control+z");
  await expect(page.locator(".cm-content")).toContainText("--dot-size: 9px");
});

test("updates the preview during a slider gesture and cancels it durably", async ({
  page,
}) => {
  await page.goto("/");
  const slider = page.getByLabel("dot size range");
  await expect(slider).toBeVisible();
  await slider.evaluate((element: HTMLInputElement) => {
    element.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, pointerId: 9 }),
    );
    element.value = "18";
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.locator(".cm-content")).toContainText("--dot-size: 18px");
  await expect
    .poll(() =>
      page
        .locator("iframe")
        .evaluate(
          (frame: HTMLIFrameElement) =>
            (
              frame.contentDocument?.querySelector(
                "#dot",
              ) as SVGGraphicsElement | null
            )?.getBBox().width,
        ),
    )
    .toBeGreaterThan(35);

  await slider.evaluate((element: HTMLInputElement) => {
    element.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }),
    );
    element.value = "16";
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(
      new PointerEvent("pointerup", { bubbles: true, pointerId: 9 }),
    );
  });
  await expect(page.locator(".cm-content")).toContainText("--dot-size: 9px");
  await expect
    .poll(() =>
      page
        .locator("iframe")
        .evaluate(
          (frame: HTMLIFrameElement) =>
            (
              frame.contentDocument?.querySelector(
                "#dot",
              ) as SVGGraphicsElement | null
            )?.getBBox().width,
        ),
    )
    .toBeLessThan(19);
});

test("accepts rapid keyboard slider steps and restores focus after publish", async ({
  page,
}) => {
  await page.goto("/");
  const slider = page.getByLabel("dot size range");
  await slider.focus();
  await slider.evaluate((element: HTMLInputElement) => {
    element.value = "10";
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.value = "11";
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.locator(".cm-content")).toContainText("--dot-size: 11px");
  await expect(page.getByLabel("dot size range")).toBeFocused();
});

test("seeks CSS and SMIL to one inspection time", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Pause animation" }).click();
  await page.getByLabel("Inspection time").fill("1.5");
  await expect(page.getByRole("timer")).toHaveText("1.50s");

  const clocks = await page
    .locator("iframe")
    .evaluate((frame: HTMLIFrameElement) => {
      const documentNode = frame.contentDocument;
      const root = documentNode?.querySelector("svg") as SVGSVGElement | null;
      return {
        smil: root?.getCurrentTime() ?? 0,
        css: Number(documentNode?.getAnimations()[0]?.currentTime ?? 0) / 1000,
      };
    });
  expect(clocks.smil).toBeCloseTo(1.5, 1);
  expect(clocks.css).toBeCloseTo(1.5, 1);
});

test("renames the bundled example and cancels or rejects invalid names", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Rename orbit-pulse.svg" }).click();
  const filename = page.getByRole("textbox", { name: "SVG filename" });
  await filename.fill("discarded");
  await filename.press("Escape");
  await expect(
    page.getByRole("button", { name: "Rename orbit-pulse.svg" }),
  ).toBeVisible();
  await expect(page.getByTestId("document-status")).toHaveText("valid");

  await page.getByRole("button", { name: "Rename orbit-pulse.svg" }).click();
  await filename.fill("");
  await filename.press("Enter");
  await expect(filename).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("alert")).toContainText("non-empty filename");
  await filename.fill("named-example");
  await filename.press("Enter");

  await expect(
    page.getByRole("button", { name: "Rename named-example.svg" }),
  ).toBeVisible();
  await expect(page.getByTestId("document-status")).toHaveText(
    "valid · changed",
  );
});

test("opens, renames, and downloads an untouched SVG with exact original bytes", async ({
  page,
}) => {
  const source =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">\r\n  <circle r="4" />\r\n</svg>\r\n';
  const original = Buffer.concat([
    Buffer.from([0xef, 0xbb, 0xbf]),
    Buffer.from(source, "utf8"),
  ]);
  await page.goto("/");
  await page.getByLabel("Open SVG file").setInputFiles({
    name: "exact.svg",
    mimeType: "image/svg+xml",
    buffer: original,
  });
  await expect(page.getByText("exact.svg", { exact: true })).toBeVisible();
  await expect(page.getByTestId("document-status")).toHaveText("valid");
  await page.getByRole("button", { name: "Rename exact.svg" }).click();
  await page.getByRole("textbox", { name: "SVG filename" }).fill("renamed");
  await page.getByRole("textbox", { name: "SVG filename" }).press("Enter");
  await expect(page.getByTestId("document-status")).toHaveText(
    "valid · changed",
  );

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "download" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("renamed.svg");
  const path = await download.path();
  expect(await readFile(path)).toEqual(original);
  await expect(page.getByTestId("document-status")).toHaveText("valid");
});

test("does not discard an unsaved filename change without confirmation", async ({
  page,
}) => {
  const replacement = `<svg xmlns="${SVG_NAMESPACE}" viewBox="0 0 10 10"><rect width="10" height="10" /></svg>`;
  await page.goto("/");
  await page.getByRole("button", { name: "Rename orbit-pulse.svg" }).click();
  await page.getByRole("textbox", { name: "SVG filename" }).fill("pending");
  await page.getByRole("textbox", { name: "SVG filename" }).press("Tab");
  await expect(
    page.getByRole("button", { name: "Rename pending.svg" }),
  ).toBeVisible();

  let prompt = "";
  page.once("dialog", async (dialog) => {
    prompt = dialog.message();
    await dialog.dismiss();
  });
  await page.getByLabel("Open SVG file").setInputFiles({
    name: "replacement.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(replacement),
  });

  expect(prompt).toContain("unsaved changes");
  await expect(
    page.getByRole("button", { name: "Rename pending.svg" }),
  ).toBeVisible();
});

test("does not replace unsaved work without confirmation", async ({ page }) => {
  const current = `<svg xmlns="${SVG_NAMESPACE}" viewBox="0 0 10 10"><circle id="keep-me" r="4" /></svg>`;
  const replacement = `<svg xmlns="${SVG_NAMESPACE}" viewBox="0 0 10 10"><rect width="10" height="10" /></svg>`;
  await page.goto("/");
  await replaceSource(page, current);
  await expect(page.getByTestId("document-status")).toContainText(
    "valid · changed",
  );

  let prompt = "";
  page.once("dialog", async (dialog) => {
    prompt = dialog.message();
    await dialog.dismiss();
  });
  await page.getByLabel("Open SVG file").setInputFiles({
    name: "replacement.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(replacement),
  });

  expect(prompt).toContain("unsaved changes");
  await expect(
    page.getByRole("button", { name: "Rename orbit-pulse.svg" }),
  ).toBeVisible();
  await expect(page.locator(".cm-content")).toContainText('id="keep-me"');
});

test("offers a recovery copy and restores it only after confirmation", async ({
  page,
}) => {
  const recovered = `<svg xmlns="${SVG_NAMESPACE}" viewBox="0 0 10 10"><circle id="recovered" r="4" /></svg>`;
  await page.goto("/");
  await replaceSource(page, recovered);
  await expect(page.getByTestId("document-status")).toContainText(
    "valid · changed",
  );
  await page.waitForTimeout(500);

  await page.reload();
  await expect(
    page.getByText(/Recovery copy of orbit-pulse\.svg/),
  ).toBeVisible();
  await expect(page.getByText(/autosave paused/)).toBeVisible();
  await expect(page.locator(".cm-content")).not.toContainText('id="recovered"');
  await page.getByRole("button", { name: "restore" }).click();
  await expect(page.locator(".cm-content")).toContainText('id="recovered"');
  await expect(page.getByTestId("document-status")).toContainText(
    "valid · changed",
  );
});

test("does not overwrite an offered recovery copy before it is resolved", async ({
  page,
}) => {
  const recovered = `<svg xmlns="${SVG_NAMESPACE}" viewBox="0 0 10 10"><circle id="first-session" r="4" /></svg>`;
  const laterEdit = `<svg xmlns="${SVG_NAMESPACE}" viewBox="0 0 10 10"><rect id="second-session" width="10" height="10" /></svg>`;
  await page.goto("/");
  await replaceSource(page, recovered);
  await page.waitForTimeout(500);

  await page.reload();
  await expect(
    page.getByText(/Recovery copy of orbit-pulse\.svg/),
  ).toBeVisible();
  await replaceSource(page, laterEdit);
  await page.waitForTimeout(600);

  await page.reload();
  await expect(
    page.getByText(/Recovery copy of orbit-pulse\.svg/),
  ).toBeVisible();
  await page.getByRole("button", { name: "restore" }).click();
  await expect(page.locator(".cm-content")).toContainText('id="first-session"');
  await expect(page.locator(".cm-content")).not.toContainText(
    'id="second-session"',
  );
});

test("discarding an offered copy resumes autosave for the current source", async ({
  page,
}) => {
  const first = `<svg xmlns="${SVG_NAMESPACE}" viewBox="0 0 10 10"><circle id="discarded-session" r="4" /></svg>`;
  const current = `<svg xmlns="${SVG_NAMESPACE}" viewBox="0 0 10 10"><rect id="current-session" width="10" height="10" /></svg>`;
  await page.goto("/");
  await replaceSource(page, first);
  await page.waitForTimeout(500);

  await page.reload();
  await expect(
    page.getByText(/Recovery copy of orbit-pulse\.svg/),
  ).toBeVisible();
  await replaceSource(page, current);
  await page.getByRole("button", { name: "discard" }).click();
  await expect(
    page.getByText(/Recovery copy of orbit-pulse\.svg/),
  ).toBeHidden();
  await page.waitForTimeout(600);

  await page.reload();
  await expect(
    page.getByText(/Recovery copy of orbit-pulse\.svg/),
  ).toBeVisible();
  await page.getByRole("button", { name: "restore" }).click();
  await expect(page.locator(".cm-content")).toContainText(
    'id="current-session"',
  );
  await expect(page.locator(".cm-content")).not.toContainText(
    'id="discarded-session"',
  );
});

test("retains recovery after an unconfirmed download and later clean edit", async ({
  page,
}) => {
  const recovered = `<svg xmlns="${SVG_NAMESPACE}" viewBox="0 0 10 10"><circle id="download-copy" r="4" /></svg>`;
  await page.goto("/");
  await replaceSource(page, recovered);
  await page.waitForTimeout(500);

  await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "download" }).click(),
  ]);
  await expect(page.getByTestId("document-status")).toHaveText("valid");

  const replacement = `<svg xmlns="${SVG_NAMESPACE}" viewBox="0 0 10 10"><rect id="replacement" width="10" height="10" /></svg>`;
  const prompt = page.waitForEvent("dialog").then(async (dialog) => {
    const message = dialog.message();
    await dialog.dismiss();
    return message;
  });
  await page.getByLabel("Open SVG file").setInputFiles({
    name: "replacement.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(replacement),
  });
  expect(await prompt).toContain("download could not be confirmed");
  await expect(page.locator(".cm-content")).toContainText('id="download-copy"');

  const editor = page.locator(".cm-content");
  await editor.click();
  await editor.press("End");
  await editor.press("Space");
  await editor.press("Backspace");
  await expect(page.getByTestId("document-status")).toHaveText("valid");
  await page.waitForTimeout(600);

  await page.reload();
  await expect(
    page.getByText(/Recovery copy of orbit-pulse\.svg/),
  ).toBeVisible();
  await page.getByRole("button", { name: "restore" }).click();
  await expect(page.locator(".cm-content")).toContainText('id="download-copy"');
});

test("reports unavailable recovery once without unhandled rejections", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const scope = window as typeof window & { __rejections: string[] };
    scope.__rejections = [];
    window.addEventListener("unhandledrejection", (event) => {
      scope.__rejections.push(String(event.reason));
    });
    Object.defineProperty(window, "indexedDB", {
      configurable: true,
      value: {
        open: () => {
          const request = {
            error: new Error("storage blocked"),
            onerror: null,
            onsuccess: null,
            onupgradeneeded: null,
          } as unknown as IDBOpenDBRequest;
          window.setTimeout(() => {
            request.onerror?.call(request, new Event("error"));
          }, 0);
          return request;
        },
      },
    });
  });

  await page.goto("/");
  const notice = page.getByText(/Recovery unavailable/);
  await expect(notice).toHaveCount(1);
  await expect(notice).toContainText("Download to keep your work");

  for (const id of ["one", "two", "three"]) {
    await replaceSource(
      page,
      `<svg xmlns="${SVG_NAMESPACE}" viewBox="0 0 10 10"><circle id="${id}" r="4" /></svg>`,
    );
    await page.waitForTimeout(400);
  }

  await expect(notice).toHaveCount(1);
  await expect(page.getByTestId("document-status")).toHaveText(
    "valid · changed",
  );
  expect(
    await page.evaluate(
      () => (window as typeof window & { __rejections: string[] }).__rejections,
    ),
  ).toEqual([]);
});

test("recovers a filename-only change as unsaved metadata", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Rename orbit-pulse.svg" }).click();
  await page
    .getByRole("textbox", { name: "SVG filename" })
    .fill("recovered-name");
  await page.getByRole("textbox", { name: "SVG filename" }).press("Enter");
  await expect(page.getByTestId("document-status")).toHaveText(
    "valid · changed",
  );
  await page.waitForTimeout(500);

  await page.reload();
  await expect(
    page.getByText(/Recovery copy of recovered-name\.svg/),
  ).toBeVisible();
  await page.getByRole("button", { name: "restore" }).click();
  await expect(
    page.getByRole("button", { name: "Rename recovered-name.svg" }),
  ).toBeVisible();
  await expect(page.getByTestId("document-status")).toHaveText(
    "valid · changed",
  );
});
