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
  await expect(page.getByText("untitled.svg")).toBeVisible();
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

test("edits root variables in source and shows sliders only for authored bounds", async ({
  page,
}) => {
  await page.goto("/");
  const dotRange = page.getByLabel("dot size range");
  await expect(dotRange).toBeVisible();
  await expect(page.getByLabel("period range")).toBeVisible();
  await expect(page.getByLabel("ink range")).toHaveCount(0);

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

test("opens and downloads an untouched SVG with exact original bytes", async ({
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

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "download" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("exact.svg");
  const path = await download.path();
  expect(await readFile(path)).toEqual(original);
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
  await expect(page.getByText("untitled.svg", { exact: true })).toBeVisible();
  await expect(page.locator(".cm-content")).toContainText('id="keep-me"');
});

test("offers unsaved recovery and restores it only after confirmation", async ({
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
  await expect(page.getByText(/Unsaved untitled\.svg/)).toBeVisible();
  await expect(page.locator(".cm-content")).not.toContainText('id="recovered"');
  await page.getByRole("button", { name: "restore" }).click();
  await expect(page.locator(".cm-content")).toContainText('id="recovered"');
  await expect(page.getByTestId("document-status")).toContainText(
    "valid · changed",
  );
});
