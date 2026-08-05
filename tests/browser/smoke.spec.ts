import { expect, test, type Page } from "@playwright/test";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

async function replaceSource(page: Page, source: string): Promise<void> {
  const editor = page.getByRole("textbox");
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

  const editor = page.getByRole("textbox");
  await editor.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.insertText("\n");
  await expect(page.getByTestId("document-status")).toContainText("changed");
  await expect
    .poll(() =>
      page.locator("iframe").evaluate((frame: HTMLIFrameElement) => {
        const root = frame.contentDocument?.querySelector("svg") as
          (SVGSVGElement & { __oldRoot?: boolean }) | null;
        return root ? !root.__oldRoot : false;
      }),
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
  const editor = page.getByRole("textbox");
  await editor.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.insertText("\n");
  await expect(page.getByTestId("document-status")).toContainText("changed");
  await page.waitForTimeout(250);
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
  await page
    .frameLocator("iframe")
    .locator("a")
    .click({ position: { x: 50, y: 50 } });
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
