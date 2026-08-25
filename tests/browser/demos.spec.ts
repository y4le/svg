import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const RAW_CARD =
  "https://raw.githubusercontent.com/y4le/svg/main/.yalethomas/card.svg";
const CARD_PATH = ".yalethomas/card.svg";
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

async function replaceSource(page: Page, source: string): Promise<void> {
  const editor = page.locator(".cm-content");
  await editor.click();
  await editor.fill(source);
}

async function stubCard(page: Page, body: Buffer): Promise<void> {
  await page.route(RAW_CARD, (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/plain; charset=utf-8",
      body,
    }),
  );
}

async function renderedMarkFill(page: Page): Promise<string | null> {
  return page.locator("iframe").evaluate((frame: HTMLIFrameElement) => {
    const mark = frame.contentDocument?.querySelector(".rendered-mark");
    return mark
      ? (frame.contentWindow?.getComputedStyle(mark).fill ?? null)
      : null;
  });
}

async function renderedCanvasBackground(page: Page): Promise<string | null> {
  return page.locator("iframe").evaluate((frame: HTMLIFrameElement) => {
    const document = frame.contentDocument;
    const window = frame.contentWindow;
    return document && window
      ? window.getComputedStyle(document.documentElement).backgroundColor
      : null;
  });
}

test("loads a clean byte-exact GitHub demo from its shortname URL", async ({
  page,
}) => {
  const card = await readFile(CARD_PATH);
  await stubCard(page, card);
  await page.goto("/?demo=card");

  await expect(
    page.getByRole("button", { name: "Rename yalethomas-card.svg" }),
  ).toBeVisible();
  await expect(page.getByTestId("document-status")).toHaveText("valid");
  await expect(page.locator("iframe")).toHaveAttribute("data-source-version");
  await expect
    .poll(() =>
      page
        .locator("iframe")
        .evaluate((frame: HTMLIFrameElement) =>
          Boolean(frame.contentDocument?.querySelector(".rendered-mark")),
        ),
    )
    .toBe(true);
  expect(new URL(page.url()).searchParams.get("demo")).toBe("card");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "download" }).click(),
  ]);
  const path = await download.path();
  expect(path).not.toBeNull();
  expect(await readFile(path)).toEqual(card);

  await page.getByLabel("Open SVG file").setInputFiles({
    name: "local.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(
      `<svg xmlns="${SVG_NAMESPACE}" viewBox="0 0 10 10"><rect width="10" height="10" /></svg>`,
    ),
  });
  await expect(
    page.getByRole("button", { name: "Rename local.svg" }),
  ).toBeVisible();
  expect(new URL(page.url()).searchParams.has("demo")).toBe(false);
});

test("exposes the catalog card's current visual parameters as source controls", async ({
  page,
}) => {
  const card = await readFile(CARD_PATH);
  await stubCard(page, card);
  await page.goto("/?demo=card");

  const values = {
    "ink light": "#1a1814",
    "ink dark": "#e8e3d5",
    "muted light": "#6f6a5e",
    "muted dark": "#8a857a",
    "faint light": "#b3ad9b",
    "faint dark": "#54524c",
    "rule light": "#d8d2c2",
    "rule dark": "#2a2926",
    accent: "#c1432e",
    "rule width": "2px",
    "mark size": "236px",
    "mark weight": "720",
    "mark tracking": "-0.06em",
    period: "4s",
  } as const;
  for (const [label, value] of Object.entries(values)) {
    await expect(page.getByLabel(`${label} value`)).toHaveValue(value);
  }
  for (const label of [
    "rule width",
    "mark size",
    "mark weight",
    "mark tracking",
    "period",
  ]) {
    await expect(page.getByLabel(`${label} range`)).toBeVisible();
  }
  await expect(page.locator(".variable-value")).toHaveCount(14);

  expect(
    await page.locator("iframe").evaluate((frame: HTMLIFrameElement) => {
      const document = frame.contentDocument;
      const window = frame.contentWindow;
      const mark = document?.querySelector(".rendered-mark");
      const rule = document?.querySelector(".frame-rule");
      if (!window || !mark || !rule) return null;
      const markStyle = window.getComputedStyle(mark);
      return {
        size: markStyle.fontSize,
        weight: markStyle.fontWeight,
        duration: markStyle.animationDuration,
        ruleWidth: window.getComputedStyle(rule).strokeWidth,
      };
    }),
  ).toEqual({
    size: "236px",
    weight: "720",
    duration: "4s",
    ruleWidth: "2px",
  });
});

test("switches the rendered SVG theme without editing source and keeps it across publishes", async ({
  page,
}) => {
  const card = await readFile(CARD_PATH);
  await stubCard(page, card);
  await page.goto("/?demo=card");
  await expect(
    page.getByRole("button", { name: "Rename yalethomas-card.svg" }),
  ).toBeVisible();
  await expect.poll(() => renderedMarkFill(page)).not.toBeNull();
  await expect(page.getByTestId("document-status")).toHaveText("valid");

  const theme = page.getByLabel("Rendered SVG theme");
  const sourceBefore = await page.locator(".cm-content").textContent();
  await theme.selectOption("light");
  await expect.poll(() => renderedMarkFill(page)).toBe("rgb(26, 24, 20)");
  await expect(page.locator(".preview-stage")).toHaveCSS(
    "background-color",
    "rgb(232, 227, 213)",
  );
  await expect
    .poll(() => renderedCanvasBackground(page))
    .toBe("rgb(232, 227, 213)");
  await expect
    .poll(() =>
      page.locator("iframe").evaluate((frame: HTMLIFrameElement) => {
        const root = frame.contentDocument?.querySelector("body > svg");
        return {
          attribute: root?.getAttribute("data-color-scheme"),
          property: (root as SVGSVGElement | undefined)?.style
            .getPropertyValue("color-scheme")
            .split(/\s+/)
            .sort()
            .join(" "),
          priority: (
            root as SVGSVGElement | undefined
          )?.style.getPropertyPriority("color-scheme"),
        };
      }),
    )
    .toEqual({
      attribute: "light",
      property: "light only",
      priority: "important",
    });

  await theme.selectOption("dark");
  await expect.poll(() => renderedMarkFill(page)).toBe("rgb(232, 227, 213)");
  await expect(page.locator(".preview-stage")).toHaveCSS(
    "background-color",
    "rgb(17, 17, 15)",
  );
  await expect
    .poll(() => renderedCanvasBackground(page))
    .toBe("rgb(17, 17, 15)");
  expect(await page.locator(".cm-content").textContent()).toBe(sourceBefore);
  const [themedDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "download" }).click(),
  ]);
  const themedPath = await themedDownload.path();
  expect(themedPath).not.toBeNull();
  expect(await readFile(themedPath)).toEqual(card);

  const versionBefore = Number(
    await page.locator("iframe").getAttribute("data-source-version"),
  );
  await page.getByLabel("accent value").fill("#b33a28");
  await page.getByLabel("accent value").press("Tab");
  await expect(page.locator("iframe")).toHaveAttribute(
    "data-source-version",
    String(versionBefore + 1),
  );
  await expect.poll(() => renderedMarkFill(page)).toBe("rgb(232, 227, 213)");
  expect(
    await page.locator("iframe").evaluate((frame: HTMLIFrameElement) => ({
      attribute: frame.contentDocument
        ?.querySelector("body > svg")
        ?.getAttribute("data-color-scheme"),
      property: (
        frame.contentDocument?.querySelector(
          "body > svg",
        ) as SVGSVGElement | null
      )?.style
        .getPropertyValue("color-scheme")
        .split(/\s+/)
        .sort()
        .join(" "),
    })),
  ).toEqual({ attribute: "dark", property: "dark only" });

  await theme.selectOption("auto");
  expect(
    await page.locator("iframe").evaluate((frame: HTMLIFrameElement) => ({
      attribute: frame.contentDocument
        ?.querySelector("body > svg")
        ?.getAttribute("data-color-scheme"),
      property: (
        frame.contentDocument?.querySelector(
          "body > svg",
        ) as SVGSVGElement | null
      )?.style.getPropertyValue("color-scheme"),
    })),
  ).toEqual({ attribute: null, property: "" });

  const authoredThemeSource = `<svg xmlns="${SVG_NAMESPACE}" viewBox="0 0 10 10" data-color-scheme="studio" style="color-scheme: only dark"><rect width="10" height="10" /></svg>`;
  const replacementVersion = Number(
    await page.locator("iframe").getAttribute("data-source-version"),
  );
  await replaceSource(page, authoredThemeSource);
  await expect(page.locator("iframe")).toHaveAttribute(
    "data-source-version",
    String(replacementVersion + 1),
  );
  await theme.selectOption("light");
  await theme.selectOption("auto");
  expect(
    await page.locator("iframe").evaluate((frame: HTMLIFrameElement) => {
      const root = frame.contentDocument?.querySelector(
        "body > svg",
      ) as SVGSVGElement | null;
      return {
        attribute: root?.getAttribute("data-color-scheme"),
        property: root?.style
          .getPropertyValue("color-scheme")
          .split(/\s+/)
          .sort()
          .join(" "),
        priority: root?.style.getPropertyPriority("color-scheme"),
      };
    }),
  ).toEqual({ attribute: "studio", property: "dark only", priority: "" });
  expect(await page.locator(".cm-content").textContent()).toContain(
    'data-color-scheme="studio"',
  );
});

test("opens the accessible picker without stealing Shift+D from source", async ({
  page,
}) => {
  await page.goto("/");
  const demos = page.getByRole("button", { name: "demos" });
  await expect(demos).toBeVisible();
  await demos.click();
  const dialog = page.getByRole("dialog", { name: "demos" });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: /Project card/ }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(demos).toBeFocused();

  await page.getByRole("button", { name: "restart" }).focus();
  await page.keyboard.press("Shift+D");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Rename orbit-pulse.svg" }).click();
  const filename = page.getByRole("textbox", { name: "SVG filename" });
  await filename.fill("name");
  await filename.press("Shift+D");
  await expect(filename).toHaveValue("nameD");
  await expect(dialog).toBeHidden();
  await filename.press("Escape");

  const theme = page.getByLabel("Rendered SVG theme");
  await theme.focus();
  await theme.press("Shift+D");
  await expect(dialog).toBeHidden();

  const editor = page.locator(".cm-content");
  await editor.click();
  await page.keyboard.press("End");
  await page.keyboard.press("Shift+D");
  await expect(dialog).toBeHidden();
  await expect(editor).toContainText("D");

  await page.setViewportSize({ width: 700, height: 800 });
  await expect(demos).toBeVisible();
});

test("confirms before fetching and updates the URL only after success", async ({
  page,
}) => {
  const card = await readFile(CARD_PATH);
  let requests = 0;
  await page.route(RAW_CARD, (route) => {
    requests += 1;
    return route.fulfill({ status: 200, body: card });
  });
  const edited = `<svg xmlns="${SVG_NAMESPACE}" viewBox="0 0 10 10"><circle id="keep-me" r="4" /></svg>`;
  await page.goto("/");
  await replaceSource(page, edited);
  await expect(page.getByTestId("document-status")).toContainText("changed");

  const dismissed = page.waitForEvent("dialog").then(async (dialog) => {
    expect(requests).toBe(0);
    await dialog.dismiss();
  });
  await page.getByRole("button", { name: "demos" }).click();
  await page.getByRole("button", { name: /Project card/ }).click();
  await dismissed;
  expect(requests).toBe(0);
  await expect(page.locator(".cm-content")).toContainText("keep-me");
  expect(new URL(page.url()).searchParams.has("demo")).toBe(false);

  const accepted = page
    .waitForEvent("dialog")
    .then((dialog) => dialog.accept());
  await page.getByRole("button", { name: "demos" }).click();
  await page.getByRole("button", { name: /Project card/ }).click();
  await accepted;
  await expect(
    page.getByRole("button", { name: "Rename yalethomas-card.svg" }),
  ).toBeVisible();
  expect(requests).toBe(1);
  expect(new URL(page.url()).searchParams.get("demo")).toBe("card");
});

test("keeps the current document on failure and supports an explicit retry", async ({
  page,
}) => {
  const card = await readFile(CARD_PATH);
  let available = false;
  let requests = 0;
  await page.route(RAW_CARD, (route) => {
    requests += 1;
    return available
      ? route.fulfill({ status: 200, body: card })
      : route.fulfill({ status: 404, body: "missing" });
  });
  await page.goto("/?demo=card");

  await expect(page.getByTestId("demo-notice")).toContainText("could not find");
  await expect(
    page.getByRole("button", { name: "Rename orbit-pulse.svg" }),
  ).toBeVisible();
  expect(new URL(page.url()).searchParams.get("demo")).toBe("card");

  available = true;
  await page.getByRole("button", { name: "retry" }).click();
  await expect(
    page.getByRole("button", { name: "Rename yalethomas-card.svg" }),
  ).toBeVisible();
  expect(requests).toBe(2);
});

test("removes stale demo actions when a local file supersedes the flow", async ({
  page,
}) => {
  await page.route(RAW_CARD, (route) =>
    route.fulfill({ status: 404, body: "missing" }),
  );
  await page.goto("/?demo=card");
  await expect(page.getByRole("button", { name: "retry" })).toBeVisible();

  await page.getByLabel("Open SVG file").setInputFiles({
    name: "replacement.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(
      `<svg xmlns="${SVG_NAMESPACE}" viewBox="0 0 10 10"><rect id="replacement" width="10" height="10" /></svg>`,
    ),
  });
  await expect(
    page.getByRole("button", { name: "Rename replacement.svg" }),
  ).toBeVisible();
  await expect(page.getByTestId("demo-notice")).toBeHidden();
  await expect(page.getByRole("button", { name: "retry" })).toHaveCount(0);
  expect(new URL(page.url()).searchParams.has("demo")).toBe(false);
});

test("cancels an in-flight demo without changing the document or URL", async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const card = await readFile(CARD_PATH);
  await page.route(RAW_CARD, async (route) => {
    await gate;
    try {
      await route.fulfill({ status: 200, body: card });
    } catch {
      // The browser correctly aborted the route before the test released it.
    }
  });
  await page.goto("/?demo=card");
  await expect(page.getByTestId("demo-notice")).toContainText("Loading");
  await page.getByRole("button", { name: "cancel" }).click();
  await expect(page.getByTestId("demo-notice")).toContainText("cancelled");
  await expect(
    page.getByRole("button", { name: "Rename orbit-pulse.svg" }),
  ).toBeVisible();
  expect(new URL(page.url()).searchParams.get("demo")).toBe("card");
  release();
});

test("keeps the bundled document visible for an unknown shortname", async ({
  page,
}) => {
  await page.goto("/?demo=Card");
  await expect(page.getByTestId("demo-notice")).toContainText(
    "Did you mean “card”?",
  );
  await expect(
    page.getByRole("button", { name: "Rename orbit-pulse.svg" }),
  ).toBeVisible();
  expect(new URL(page.url()).searchParams.get("demo")).toBe("Card");
});

test("defers a startup demo until the recovery choice is resolved", async ({
  page,
}) => {
  const card = await readFile(CARD_PATH);
  const recovered = `<svg xmlns="${SVG_NAMESPACE}" viewBox="0 0 10 10"><circle id="recovered" r="4" /></svg>`;
  await page.goto("/");
  await replaceSource(page, recovered);
  await expect(page.getByTestId("document-status")).toContainText("changed");
  await page.waitForTimeout(500);

  let requests = 0;
  await page.route(RAW_CARD, (route) => {
    requests += 1;
    return route.fulfill({ status: 200, body: card });
  });
  await page.goto("/?demo=card");
  await expect(
    page.getByText(/Recovery copy of orbit-pulse\.svg/),
  ).toBeVisible();
  expect(requests).toBe(0);
  await page.getByRole("button", { name: "discard" }).click();
  await expect(
    page.getByRole("button", { name: "Rename yalethomas-card.svg" }),
  ).toBeVisible();
  expect(requests).toBe(1);
});

test("resumes startup demo loading when discarding recovery storage fails", async ({
  page,
}) => {
  const card = await readFile(CARD_PATH);
  const recovered = `<svg xmlns="${SVG_NAMESPACE}" viewBox="0 0 10 10"><circle id="recovered" r="4" /></svg>`;
  await page.goto("/");
  await replaceSource(page, recovered);
  await page.waitForTimeout(500);

  let requests = 0;
  await page.route(RAW_CARD, (route) => {
    requests += 1;
    return route.fulfill({ status: 200, body: card });
  });
  await page.goto("/?demo=card");
  await expect(
    page.getByText(/Recovery copy of orbit-pulse\.svg/),
  ).toBeVisible();
  await page.evaluate(() => {
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
  await page.getByRole("button", { name: "discard" }).click();
  await expect(page.getByText(/Recovery unavailable/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Rename yalethomas-card.svg" }),
  ).toBeVisible();
  expect(requests).toBe(1);
});

test("routes hostile remote source through the ordinary preview hardening", async ({
  page,
}) => {
  const hostile =
    Buffer.from(`<svg xmlns="${SVG_NAMESPACE}" viewBox="0 0 10 10">
    <script>parent.__demoPwned = true</script>
    <rect onload="parent.__demoPwned = true" width="10" height="10" />
    <image href="https://example.invalid/tracker.png" width="1" height="1" />
  </svg>`);
  await stubCard(page, hostile);
  await page.goto("/?demo=card");

  await expect(page.getByText(/blocked:/)).toContainText("script");
  await expect(page.getByText(/blocked:/)).toContainText("handler");
  await expect(page.getByText(/blocked:/)).toContainText("resource reference");
  expect(
    await page.locator("iframe").evaluate((frame: HTMLIFrameElement) => ({
      script: frame.contentDocument
        ?.querySelector("script")
        ?.getAttribute("type"),
      onload: frame.contentDocument
        ?.querySelector("rect")
        ?.hasAttribute("onload"),
      href: frame.contentDocument?.querySelector("image")?.getAttribute("href"),
    })),
  ).toEqual({
    script: "application/x-svg-workbench-disabled",
    onload: false,
    href: null,
  });
  expect(
    await page.evaluate(
      () => (window as typeof window & { __demoPwned?: boolean }).__demoPwned,
    ),
  ).toBeUndefined();
});

test("loads the public card from live GitHub when explicitly enabled", async ({
  page,
}) => {
  test.skip(
    process.env.DEMO_LIVE !== "1",
    "Set DEMO_LIVE=1 for the live probe",
  );
  await page.goto("/?demo=card");
  await expect(
    page.getByRole("button", { name: "Rename yalethomas-card.svg" }),
  ).toBeVisible();
  await expect(page.getByTestId("document-status")).toHaveText("valid");
});
