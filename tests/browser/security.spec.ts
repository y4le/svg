import { expect, test } from "@playwright/test";
import type { validateSvg } from "../../src/document/validation";
import type { hardenImportedSvg } from "../../src/security/previewPolicy";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

// These module-level browser tests intentionally depend on Playwright's Vite
// dev server so XML parsing, namespaces, and foreign content use native DOM
// semantics instead of a Node DOM emulation.

test("validates SVG structure with native parser diagnostics", async ({
  page,
}) => {
  await page.goto("/");
  const results = await page.evaluate(async () => {
    const validationPath = "/src/document/validation.ts";
    const validation = (await import(validationPath)) as {
      validateSvg: typeof validateSvg;
    };
    const svgNamespace = "http://www.w3.org/2000/svg";
    const summarize = (source: string) => {
      const result = validation.validateSvg(source);
      return result.ok
        ? { ok: true as const }
        : {
            ok: false as const,
            code: result.diagnostic.code,
            message: result.diagnostic.message,
            line: result.diagnostic.line,
          };
    };
    return {
      doctypes: [
        `<!DOCTYPE svg><svg xmlns="${svgNamespace}" />`,
        `\ufeff<?xml version="1.0"?><!DOCTYPE svg><svg xmlns="${svgNamespace}" />`,
        `<!-- prolog --><!DOCTYPE svg><svg xmlns="${svgNamespace}" />`,
      ].map(summarize),
      malformed: summarize(`<svg xmlns="${svgNamespace}"><g></svg>`),
      wrongRoot: summarize('<html xmlns="http://www.w3.org/1999/xhtml" />'),
      missingNamespace: summarize("<svg />"),
    };
  });

  expect(results.doctypes).toEqual([
    expect.objectContaining({ ok: false, code: "doctype-disabled" }),
    expect.objectContaining({ ok: false, code: "doctype-disabled" }),
    expect.objectContaining({ ok: false, code: "doctype-disabled" }),
  ]);
  expect(results.malformed).toEqual(
    expect.objectContaining({ ok: false, code: "invalid-xml" }),
  );
  expect(results.malformed.message).toBeTruthy();
  expect(results.malformed.message).not.toMatch(
    /Below is a rendering|This page contains the following errors/i,
  );
  expect(results.wrongRoot).toEqual(
    expect.objectContaining({ ok: false, code: "not-svg" }),
  );
  expect(results.missingNamespace).toEqual(
    expect.objectContaining({ ok: false, code: "missing-svg-namespace" }),
  );
});

test("hardens hostile SVG and foreign content before insertion", async ({
  page,
}) => {
  await page.goto("/");
  const hardened = await page.evaluate(async () => {
    const policyPath = "/src/security/previewPolicy.ts";
    const policy = (await import(policyPath)) as {
      hardenImportedSvg: typeof hardenImportedSvg;
    };
    const parsed = new DOMParser().parseFromString(
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
        <defs><g><use id="deep-remote" xlink:href="https://example.invalid/deep.svg#shape" /><use id="deep-local" xlink:href="#shape" /></g></defs>
        <image id="remote-image" xlink:href="https://example.invalid/image.svg" />
        <a id="navigation" xlink:href="https://example.invalid/go"><rect /></a>
        <script id="svg-script">parent.pwned = true</script>
        <foreignObject><div xmlns="http://www.w3.org/1999/xhtml" onLoad="parent.pwned = true">
          <script id="html-script">parent.pwned = true</script>
          <iframe id="frame" srcdoc="&lt;p&gt;remote&lt;/p&gt;"></iframe>
          <img id="html-image" src="https://example.invalid/image.png" srcset="https://example.invalid/twice.png 2x" />
          <form id="form" action="https://example.invalid/submit"><input id="submit" formaction="https://example.invalid/other" /></form>
          <video id="remote-poster" poster="https://example.invalid/poster.png"></video>
          <video id="data-poster" poster="data:image/png;base64,AA=="></video>
          <object id="remote-object" data="https://example.invalid/object.html"></object>
          <object id="data-object" data="data:image/svg+xml;base64,PHN2Zy8+"></object>
        </div></foreignObject>
        <style id="sheet">@import url("https://example.invalid/theme.css"); .a { fill: url("https://example.invalid/paint.svg"); filter: url(#local); background: url(data:image/png;base64,AA==); }</style>
        <rect id="styled" style="mask: url(https://example.invalid/mask.svg); fill: url(#paint)" />
      </svg>`,
      "image/svg+xml",
    );
    const root = document.importNode(parsed.documentElement, true);
    const bodyChildren = document.body.childElementCount;
    policy.hardenImportedSvg(root);
    const scripts = [...root.querySelectorAll("script")];
    const attributes = [...root.querySelectorAll("*")].flatMap((element) =>
      [...element.attributes].map((attribute) => attribute.name.toLowerCase()),
    );
    const sheet = root.querySelector("#sheet")?.textContent ?? "";
    const inlineStyle =
      root.querySelector("#styled")?.getAttribute("style") ?? "";
    return {
      detached:
        !root.isConnected && document.body.childElementCount === bodyChildren,
      deepRemote: root
        .querySelector("#deep-remote")
        ?.getAttributeNS("http://www.w3.org/1999/xlink", "href"),
      deepLocal: root
        .querySelector("#deep-local")
        ?.getAttributeNS("http://www.w3.org/1999/xlink", "href"),
      imageHref: root
        .querySelector("#remote-image")
        ?.getAttributeNS("http://www.w3.org/1999/xlink", "href"),
      navigationHref: root
        .querySelector("#navigation")
        ?.getAttributeNS("http://www.w3.org/1999/xlink", "href"),
      navigationMarked: root
        .querySelector("#navigation")
        ?.hasAttribute("data-svg-workbench-blocked-link"),
      scripts: scripts.map((script) => ({
        text: script.textContent,
        type: script.getAttribute("type"),
      })),
      handlers: attributes.filter((name) => name.startsWith("on")),
      frameSrcdoc: root.querySelector("#frame")?.getAttribute("srcdoc"),
      htmlImageSrc: root.querySelector("#html-image")?.getAttribute("src"),
      htmlImageSrcset: root
        .querySelector("#html-image")
        ?.getAttribute("srcset"),
      formAction: root.querySelector("#form")?.getAttribute("action"),
      submitAction: root.querySelector("#submit")?.getAttribute("formaction"),
      remotePoster: root
        .querySelector("#remote-poster")
        ?.getAttribute("poster"),
      dataPoster: root.querySelector("#data-poster")?.getAttribute("poster"),
      remoteObject: root.querySelector("#remote-object")?.getAttribute("data"),
      dataObject: root.querySelector("#data-object")?.getAttribute("data"),
      sheet,
      inlineStyle,
    };
  });

  expect(hardened).toEqual({
    detached: true,
    deepRemote: null,
    deepLocal: "#shape",
    imageHref: null,
    navigationHref: null,
    navigationMarked: true,
    scripts: [
      { text: "", type: "application/x-svg-workbench-disabled" },
      { text: "", type: "application/x-svg-workbench-disabled" },
    ],
    handlers: [],
    frameSrcdoc: null,
    htmlImageSrc: null,
    htmlImageSrcset: null,
    formAction: null,
    submitAction: null,
    remotePoster: null,
    dataPoster: "data:image/png;base64,AA==",
    remoteObject: null,
    dataObject: "data:image/svg+xml;base64,PHN2Zy8+",
    sheet:
      ' .a { fill: url("#__svg_workbench_blocked__"); filter: url(#local); background: url(data:image/png;base64,AA==); }',
    inlineStyle: 'mask: url("#__svg_workbench_blocked__"); fill: url(#paint)',
  });
});

test("aligns validation counts with the hardened result", async ({ page }) => {
  await page.goto("/");
  const capabilities = await page.evaluate(async () => {
    const policyPath = "/src/security/previewPolicy.ts";
    const validationPath = "/src/document/validation.ts";
    const policy = (await import(policyPath)) as {
      hardenImportedSvg: typeof hardenImportedSvg;
    };
    const validation = (await import(validationPath)) as {
      validateSvg: typeof validateSvg;
    };
    const source = `<svg xmlns="http://www.w3.org/2000/svg">
      <style>@import url("https://example.invalid/theme.css");</style>
      <script>parent.pwned = true</script>
      <rect onclick="parent.pwned = true" />
      <image href="https://example.invalid/image.svg" />
      <a href="https://example.invalid/go"><rect /></a>
      <foreignObject>
        <iframe xmlns="http://www.w3.org/1999/xhtml" srcdoc="&lt;p&gt;x&lt;/p&gt;"></iframe>
        <form xmlns="http://www.w3.org/1999/xhtml" action="https://example.invalid/submit"></form>
        <video xmlns="http://www.w3.org/1999/xhtml" poster="data:image/png;base64,AA=="></video>
        <video xmlns="http://www.w3.org/1999/xhtml" poster="https://example.invalid/poster.png"></video>
        <object xmlns="http://www.w3.org/1999/xhtml" data="data:image/svg+xml;base64,PHN2Zy8+"></object>
        <object xmlns="http://www.w3.org/1999/xhtml" data="https://example.invalid/object.html"></object>
      </foreignObject>
    </svg>`;
    const before = validation.validateSvg(source);
    if (!before.ok) throw new Error(before.diagnostic.message);
    const imported = document.importNode(before.document.documentElement, true);
    policy.hardenImportedSvg(imported);
    const after = validation.validateSvg(
      new XMLSerializer().serializeToString(imported),
    );
    if (!after.ok) throw new Error(after.diagnostic.message);
    return { before: before.disabled, after: after.disabled };
  });

  expect(capabilities).toEqual({
    before: {
      scripts: 1,
      eventHandlers: 1,
      externalReferences: 5,
      navigation: 2,
      embeddedDocuments: 3,
    },
    after: {
      scripts: 1,
      eventHandlers: 0,
      externalReferences: 0,
      navigation: 0,
      embeddedDocuments: 3,
    },
  });
});

test("keeps foreign content inert without deleting it", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.url().startsWith("https://example.invalid"))
      requests.push(request.url());
  });
  await page.goto("/");
  await page.locator(".cm-content").fill(
    `<svg xmlns="${SVG_NAMESPACE}" viewBox="0 0 100 100">
      <foreignObject id="foreign" width="100" height="100">
        <div xmlns="http://www.w3.org/1999/xhtml">
          <meta http-equiv="refresh" content="0;url=https://example.invalid/refresh" />
          <base href="https://example.invalid/base/" />
          <form id="foreign-form" action="https://example.invalid/submit"><input formaction="https://example.invalid/other" /></form>
          <img src="https://example.invalid/image.png" />
        </div>
      </foreignObject>
    </svg>`,
  );
  await expect
    .poll(() =>
      page
        .locator("iframe")
        .evaluate((frame: HTMLIFrameElement) =>
          Boolean(frame.contentDocument?.querySelector("#foreign")),
        ),
    )
    .toBe(true);

  const content = await page
    .locator("iframe")
    .evaluate((frame: HTMLIFrameElement) => {
      const documentNode = frame.contentDocument;
      const form = documentNode?.querySelector(
        "#foreign-form",
      ) as HTMLFormElement | null;
      const result = {
        location: frame.contentWindow?.location.href,
        metaRefresh: Boolean(
          documentNode?.querySelector('#foreign meta[http-equiv="refresh"]'),
        ),
        base: Boolean(documentNode?.querySelector("base")),
        formAction: form?.getAttribute("action"),
        inputAction: documentNode
          ?.querySelector("input")
          ?.getAttribute("formaction"),
        imageSource: documentNode?.querySelector("img")?.getAttribute("src"),
      };
      form?.submit();
      return result;
    });
  await page.waitForTimeout(150);

  expect(content).toEqual({
    location: "about:srcdoc",
    metaRefresh: true,
    base: true,
    formAction: null,
    inputAction: null,
    imageSource: null,
  });
  expect(
    await page
      .locator("iframe")
      .evaluate(
        (frame: HTMLIFrameElement) => frame.contentWindow?.location.href,
      ),
  ).toBe("about:srcdoc");
  expect(requests).toEqual([]);
});
