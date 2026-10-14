const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { runSelectionSummarySmoke } = require("./selection-summary-smoke.js");
const { runThemeSmoke } = require("./theme-smoke.js");

async function main(providedBrowser, providedExtensionId) {
  const port = process.argv[2];
  const extensionId = providedExtensionId || process.argv[3];
  if ((!providedBrowser && !port) || !extensionId) throw new Error("Pass the debugging port and extension ID.");

  let browser = providedBrowser;
  async function closeBrowser() {
    if (!browser?.isConnected()) return;
    try {
      const cdp = await browser.newBrowserCDPSession();
      await cdp.send("Browser.close");
    } catch (_error) {
      await browser.close().catch(() => {});
    }
  }
  const interrupt = () => { closeBrowser().finally(() => process.exit(130)); };
  const terminate = () => { closeBrowser().finally(() => process.exit(143)); };
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", terminate);
  try {
    if (!browser) browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    const context = browser.contexts()[0];
    const page = context.pages().find((candidate) => candidate.url().includes("fixture.html"));
    assert.ok(page, "fixture page is open");

    const fixtureHtml = fs.readFileSync(path.resolve(__dirname, "fixture.html"), "utf8");
    const matchedFixtureUrl = "https://dev.azure.com/codex-extension-smoke/_workitems/edit/1234";
    await context.route(`${matchedFixtureUrl}**`, (route) => route.fulfill({
      status: 200,
      contentType: "text/html",
      body: fixtureHtml,
    }));
    const packagedPage = await context.newPage();
    await packagedPage.goto(matchedFixtureUrl);
    const packagedCopy = packagedPage.locator(".wit-card").first().getByRole("button");
    await packagedPage.locator("[data-azure-niceties-status][role='status']").waitFor();
    await packagedCopy.click();
    assert.equal(await packagedPage.evaluate(() => window.nativeCopyClicks["1234"] || 0), 1,
      "enhanced copying remains native before the user approves the disclosure");
    assert.equal(await packagedCopy.getAttribute("data-azure-niceties-copied"), null,
      "no enhanced copy confirmation appears before consent");
    const consentPopup = await context.newPage();
    await consentPopup.goto(`chrome-extension://${extensionId}/options/options.html`);
    await consentPopup.locator("#data-consent").check();
    await consentPopup.getByText("Enhanced copying enabled", { exact: true }).waitFor();
    assert.equal(await consentPopup.evaluate(async () =>
      (await chrome.storage.local.get("dataConsent")).dataConsent), true,
    "approval is saved locally");
    await consentPopup.close();
    await packagedPage.mouse.move(0, 0);
    await packagedCopy.hover();
    await packagedPage.waitForFunction(() =>
      document.querySelector(".wit-card button")?.dataset.azureNicetiesEnhanced === "true"
    );
    await packagedCopy.click();
    await packagedPage.waitForFunction(() =>
      document.querySelector(".wit-card button")?.dataset.azureNicetiesCopiedLabel === "PBI 1234: Improve board copy"
    );
    assert.equal(await packagedPage.evaluate(() => window.nativeCopyClicks["1234"] || 0), 1,
      "the manifest-loaded content script suppresses the page's native copy handler");
    await packagedPage.close();
    await context.unroute(`${matchedFixtureUrl}**`);

    const isolationPopup = await context.newPage();
    await isolationPopup.goto(`chrome-extension://${extensionId}/options/options.html`);
    await isolationPopup.locator("#data-consent").uncheck();
    await isolationPopup.getByText("Enhanced copying disabled", { exact: true }).waitFor();
    await isolationPopup.close();
    const directFixtureUrl = "https://dev.azure.com/example/project/_boards/board";
    await context.route(`${directFixtureUrl}**`, (route) => route.fulfill({
      status: 200,
      contentType: "text/html",
      body: fixtureHtml,
    }));
    await page.goto(directFixtureUrl);

    await page.evaluate(() => {
      window.copiedPayload = null;
      window.clipboardWriteCount = 0;
      window.copiedEventCount = 0;
      window.forceClipboardFailure = false;
      window.forceClipboardNoEvent = false;
      window.addEventListener("azure-niceties:copied", () => { window.copiedEventCount += 1; });
      window.azureNicetiesTestSettings = { dataConsent: true, includeParent: false, branchPrefix: "feature" };
      document.execCommand = (command) => {
        assertCopyCommand(command);
        if (window.forceClipboardFailure) {
          window.forceClipboardFailure = false;
          return false;
        }
        if (window.forceClipboardNoEvent) {
          window.forceClipboardNoEvent = false;
          return true;
        }
        const clipboardData = new DataTransfer();
        const event = new ClipboardEvent("copy", {
          clipboardData,
          bubbles: true,
          cancelable: true,
        });
        document.dispatchEvent(event);
        if (!event.defaultPrevented || !clipboardData.types.includes("text/plain")) return false;
        window.clipboardWriteCount += 1;
        const html = clipboardData.getData("text/html");
        window.copiedPayload = {
          plainText: clipboardData.getData("text/plain"),
          ...(html ? { html } : {}),
          rich: Boolean(html),
        };
        return true;
      };
      function assertCopyCommand(command) {
        if (command !== "copy") throw new Error(`Unexpected command: ${command}`);
      }
    });

    await page.addScriptTag({ path: path.resolve(__dirname, "../src/work-item.js") });
    await page.addScriptTag({ path: path.resolve(__dirname, "../src/content.js") });

    const firstCopy = page.locator(".wit-card").first().getByRole("button");
    const editableCopy = page.locator(".editable-card").getByRole("button");
    const liveFormCopy = page.locator("#live-form-copy");
    const liveFormLink = page.locator(".work-item-form-header a[href*='/_workitems/edit/5']");
    const descriptionCopy = page.locator("#description-copy");
    const cloneUrlCopy = page.locator("#clone-url-copy");
    const relatedItemCopy = page.locator("#related-item-copy");
    const genericRelatedCopy = page.locator("#generic-related-copy");
    const genericCopyLink = page.locator("#generic-copy-link");
    const genericCopyIteration = page.locator("#generic-copy-iteration");
    const dataItemCopyLink = page.locator("#data-item-copy-link");
    const dataItemCopyIteration = page.locator("#data-item-copy-iteration");
    const asyncCopyA = page.locator("#async-copy-a");
    const asyncCopyB = page.locator("#async-copy-b");
    const retryParentCopy = page.locator("#retry-parent-copy");
    const crossOrgACopy = page.locator("#cross-org-a-copy");
    const crossOrgBCopy = page.locator("#cross-org-b-copy");
    const hiddenHoverCopy = page.locator("#hidden-hover-copy");
    const prWorkItemCopy = page.locator("#pr-work-item-copy");
    const prCloneCopy = page.locator("#pr-clone-copy");
    const prFieldCopy = page.locator("#pr-field-copy");

    await editableCopy.click();
    await page.waitForFunction(() => window.copiedPayload?.plainText?.includes("2345"));
    assert.deepEqual(await page.evaluate(() => window.copiedPayload), {
      plainText: "PBI 2345: Improve sample workflow",
      html: '<a href="https://dev.azure.com/example/project/_workitems/edit/2345">PBI 2345: Improve sample workflow</a>',
      rich: true,
    });

    await page.evaluate(() => { window.location.hash = "/_workitems/edit/5"; });
    await liveFormCopy.click();
    await page.waitForFunction(() => window.copiedPayload?.plainText === "PBI 5: test 2");
    assert.deepEqual(await page.evaluate(() => window.copiedPayload), {
      plainText: "PBI 5: test 2",
      html: '<a href="https://dev.azure.com/example/project/_workitems/edit/5">PBI 5: test 2</a>',
      rich: true,
    }, "live Azure DevOps work-item form copy control is enhanced");
    assert.equal(await page.evaluate(() => window.nativeCopyClicks["live-form-copy"] || 0), 0);
    await page.waitForFunction(() =>
      document.querySelector("[data-azure-niceties-status]")?.textContent === "Copied PBI 5: test 2"
    );
    assert.equal(await page.locator("[data-azure-niceties-status]").getAttribute("role"), "status");
    assert.equal(
      await page.locator("[data-azure-niceties-status]").textContent(),
      "Copied PBI 5: test 2",
      "copy success is announced to assistive technology"
    );

    const beforeDescriptionCopy = await page.evaluate(() => window.copiedPayload);
    await descriptionCopy.click();
    assert.deepEqual(
      await page.evaluate(() => window.copiedPayload),
      beforeDescriptionCopy,
      "an unrelated generic form-page copy control is not hijacked"
    );
    assert.equal(await page.evaluate(() => window.nativeCopyClicks["description-copy"]), 1);
    await cloneUrlCopy.click();
    assert.deepEqual(
      await page.evaluate(() => window.copiedPayload),
      beforeDescriptionCopy,
      "a descriptive but unrelated form-page copy control is not hijacked"
    );
    assert.equal(await page.evaluate(() => window.nativeCopyClicks["clone-url-copy"]), 1);

    await page.evaluate(() => { window.location.hash = "/_workitems/edit/5"; });
    await relatedItemCopy.click();
    await page.waitForFunction(() => window.copiedPayload?.plainText === "PBI 200: Related item");
    assert.deepEqual(await page.evaluate(() => window.copiedPayload), {
      plainText: "PBI 200: Related item",
      html: '<a href="https://dev.azure.com/example/project/_workitems/edit/200">PBI 200: Related item</a>',
      rich: true,
    }, "related-item rows use their own URL instead of the open work-item URL");
    await genericRelatedCopy.click();
    await page.waitForFunction(() => window.copiedPayload?.plainText === "PBI 201: Generic related item");
    assert.deepEqual(await page.evaluate(() => window.copiedPayload), {
      plainText: "PBI 201: Generic related item",
      html: '<a href="https://dev.azure.com/example/project/_workitems/edit/201">PBI 201: Generic related item</a>',
      rich: true,
    }, "generic related-item wrappers use their associated link URL");
    const beforeGenericControls = await page.evaluate(() => window.copiedPayload);
    await genericCopyIteration.click();
    assert.deepEqual(await page.evaluate(() => window.copiedPayload), beforeGenericControls,
      "generic Copy iteration path controls remain native");
    assert.equal(await page.evaluate(() => window.nativeCopyClicks["generic-copy-iteration"]), 1);
    await genericCopyLink.click();
    await page.waitForFunction(() => window.copiedPayload?.plainText === "PBI 202: Generic copy controls");
    assert.equal(await page.evaluate(() => window.nativeCopyClicks["generic-copy-link"] || 0), 0,
      "generic Copy link controls remain enhanced");
    const beforeDataItemControls = await page.evaluate(() => window.copiedPayload);
    await dataItemCopyIteration.click();
    assert.deepEqual(await page.evaluate(() => window.copiedPayload), beforeDataItemControls,
      "data-item-id Copy iteration path controls remain native");
    assert.equal(await page.evaluate(() => window.nativeCopyClicks["data-item-copy-iteration"]), 1);
    await dataItemCopyLink.click();
    await page.waitForFunction(() => window.copiedPayload?.plainText === "PBI 203: Data item copy controls");
    assert.equal(await page.evaluate(() => window.nativeCopyClicks["data-item-copy-link"] || 0), 0,
      "data-item-id Copy link controls remain enhanced");
    await page.evaluate(() => { window.location.hash = "/_workitems/edit/5"; });

    await liveFormLink.focus();
    await liveFormLink.press("Shift+Alt+b");
    await page.waitForFunction(() => window.copiedPayload?.plainText === "feature/5-test-2");
    assert.equal(
      (await page.evaluate(() => window.copiedPayload)).plainText,
      "feature/5-test-2",
      "live Azure DevOps work-item form shortcut resolves the form container"
    );

    await page.waitForFunction(() =>
      !document.querySelector("#live-form-copy")?.hasAttribute("data-azure-niceties-copied")
    );
    await liveFormCopy.hover();
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press("Shift+Alt+c");
    await page.waitForFunction(() => window.copiedPayload?.plainText === "PBI 5: test 2");
    assert.equal(await page.locator("body").getAttribute("data-azure-niceties-copied"), null,
      "keyboard confirmation does not decorate the entire page");
    assert.equal(await liveFormCopy.getAttribute("data-azure-niceties-copied"), "true",
      "keyboard confirmation targets the associated copy control");
    await page.evaluate(() => { window.location.hash = ""; });

    const editableTitle = page.locator(".editable-card input[aria-label='Title field']");
    const beforeEditableShortcut = await page.evaluate(() => window.copiedPayload);
    await page.evaluate(() => {
      window.nativeEditableShortcutCount = 0;
      window.editableShortcutDefaultPrevented = null;
      document.addEventListener("keydown", (event) => {
        if (event.shiftKey && event.altKey && event.code === "KeyC" && event.target.matches("input")) {
          window.nativeEditableShortcutCount += 1;
          window.editableShortcutDefaultPrevented = event.defaultPrevented;
        }
      });
    });
    await editableTitle.press("Shift+Alt+c");
    assert.deepEqual(await page.evaluate(() => window.copiedPayload), beforeEditableShortcut, "shortcuts do not override editable fields");
    assert.equal(await page.evaluate(() => window.nativeEditableShortcutCount), 1,
      "editable shortcuts remain available to Azure DevOps and the input");
    assert.equal(await page.evaluate(() => window.editableShortcutDefaultPrevented), false,
      "editable shortcuts are not canceled");

    await prWorkItemCopy.click();
    await page.waitForFunction(() => window.copiedPayload?.plainText?.includes("2345"));
    assert.deepEqual(await page.evaluate(() => window.copiedPayload), {
      plainText: "PBI 2345: Improve sample workflow",
      html: '<a href="https://dev.azure.com/example/project/_workitems/edit/2345">PBI 2345: Improve sample workflow</a>',
      rich: true,
    });

    const beforeNativeCopy = await page.evaluate(() => window.copiedPayload);
    await prCloneCopy.click();
    assert.deepEqual(await page.evaluate(() => window.copiedPayload), beforeNativeCopy, "unrelated PR copy did not touch the clipboard");
    assert.equal(await page.evaluate(() => window.nativeCopyClicks["pr-clone-copy"]), 1, "unrelated PR copy retained native behavior");
    assert.equal(await page.evaluate(() => window.nativeCopyClicks["pr-work-item-copy"] || 0), 0, "PR work-item copy was enhanced");

    await page.evaluate(() => { window.forceClipboardFailure = true; });
    await prWorkItemCopy.click();
    await page.waitForFunction(() => window.nativeCopyClicks["pr-work-item-copy"] === 1);
    assert.equal(await page.evaluate(() => window.nativeCopyClicks["pr-work-item-copy"]), 1, "clipboard failure restored native PR copy behavior");

    await page.evaluate(() => { window.forceClipboardNoEvent = true; });
    await prWorkItemCopy.click();
    await page.waitForFunction(() => window.nativeCopyClicks["pr-work-item-copy"] === 2);
    assert.equal(await page.evaluate(() => window.nativeCopyClicks["pr-work-item-copy"]), 2,
      "execCommand reporting success without a copy event restores native behavior");

    await prFieldCopy.click();
    assert.deepEqual(await page.evaluate(() => window.copiedPayload), beforeNativeCopy, "unrelated copy in the PR row did not touch the clipboard");
    assert.equal(await page.evaluate(() => window.nativeCopyClicks["pr-field-copy"]), 1, "other PR row copy controls retained native behavior");

    await firstCopy.click({ modifiers: ["Shift"] });
    await page.waitForFunction(() => window.copiedPayload?.plainText?.startsWith("[PBI 1234:"));
    assert.equal(
      (await page.evaluate(() => window.copiedPayload)).plainText,
      "[PBI 1234: Improve board copy](https://dev.azure.com/example/project/_workitems/edit/1234)"
    );

    await firstCopy.click({ modifiers: ["Alt"] });
    await page.waitForFunction(() => window.copiedPayload?.plainText === "#1234");
    assert.equal((await page.evaluate(() => window.copiedPayload)).plainText, "#1234");

    await firstCopy.click({ modifiers: ["Meta"] });
    await page.waitForFunction(() => window.copiedPayload?.plainText === "https://dev.azure.com/example/project/_workitems/edit/1234");
    assert.equal(
      (await page.evaluate(() => window.copiedPayload)).plainText,
      "https://dev.azure.com/example/project/_workitems/edit/1234"
    );

    await firstCopy.click({ modifiers: ["Shift", "Alt"] });
    await page.waitForFunction(() => window.copiedPayload?.plainText === "feature/1234-improve-board-copy");
    assert.equal(
      (await page.evaluate(() => window.copiedPayload)).plainText,
      "feature/1234-improve-board-copy"
    );

    await firstCopy.focus();
    await firstCopy.press("Shift+Alt+c");
    await page.waitForFunction(() => window.copiedPayload?.plainText === "PBI 1234: Improve board copy");
    assert.equal((await page.evaluate(() => window.copiedPayload)).plainText, "PBI 1234: Improve board copy");
    await firstCopy.press("Shift+Alt+b");
    await page.waitForFunction(() => window.copiedPayload?.plainText === "feature/1234-improve-board-copy");
    assert.equal((await page.evaluate(() => window.copiedPayload)).plainText, "feature/1234-improve-board-copy");

    await page.evaluate(() => {
      window.azureNicetiesTestSettings.includeParent = true;
      window.successfulParentChildRequests = 0;
      window.fetch = async (url) => {
        if (String(url).includes("$expand=relations")) {
          window.successfulParentChildRequests += 1;
          return { ok: true, async json() { return { relations: [{ rel: "System.LinkTypes.Hierarchy-Reverse", url: "https://dev.azure.com/example/_apis/wit/workItems/900", attributes: { name: "Parent" } }] }; } };
        }
        return { ok: true, async json() { return { id: 900, fields: { "System.Title": "Sample parent", "System.WorkItemType": "Feature" }, _links: { html: { href: "https://dev.azure.com/example/project/_workitems/edit/900" } } }; } };
      };
    });
    await page.waitForFunction(() =>
      !document.querySelector(".wit-card button")?.hasAttribute("data-azure-niceties-copied")
    );
    await firstCopy.click();
    await page.waitForFunction(() => window.copiedPayload?.plainText?.startsWith("Feature 900"));
    assert.equal(
      (await page.evaluate(() => window.copiedPayload)).plainText,
      "Feature 900: Sample parent › PBI 1234: Improve board copy"
    );
    await page.waitForFunction(
      () => document.querySelector(".wit-card button")?.getAttribute("data-azure-niceties-copied") === "true",
      undefined,
      { polling: 50 }
    );
    assert.equal(await firstCopy.getAttribute("data-azure-niceties-copied"), "true");
    const beforeCachedCopyWrites = await page.evaluate(() => window.clipboardWriteCount);
    await firstCopy.click();
    await page.waitForFunction((before) => window.clipboardWriteCount > before, beforeCachedCopyWrites);
    assert.equal(await page.evaluate(() => window.successfulParentChildRequests), 1,
      "a successful parent lookup is reused briefly");

    await page.evaluate(() => {
      window.resolveSlowParentLookup = null;
      window.slowParentLookupCompleted = false;
      window.fetch = async (url) => {
        const value = String(url);
        if (value.includes("/7001") && value.includes("$expand=relations")) {
          return new Promise((resolve) => {
            window.resolveSlowParentLookup = () => resolve({
              ok: true,
              async json() {
                window.slowParentLookupCompleted = true;
                return { relations: [] };
              },
            });
          });
        }
        if (value.includes("/7002") && value.includes("$expand=relations")) {
          return { ok: true, async json() { return { relations: [] }; } };
        }
        throw new Error(`Unexpected async ordering request: ${value}`);
      };
    });
    await asyncCopyA.click();
    await page.waitForFunction(() => typeof window.resolveSlowParentLookup === "function");
    await asyncCopyB.click();
    await page.waitForFunction(() => window.copiedPayload?.plainText === "Bug 7002: Fast parent lookup");
    await page.evaluate(() => window.resolveSlowParentLookup());
    await page.waitForFunction(() => window.slowParentLookupCompleted);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(
      (await page.evaluate(() => window.copiedPayload)).plainText,
      "Bug 7002: Fast parent lookup",
      "a slower earlier copy cannot overwrite the newer gesture"
    );

    await page.evaluate(() => {
      window.nativeDocumentCopyCount = 0;
      window.documentCopyFetchCompleted = false;
      window.resolveDocumentCopyFetch = null;
      window.fetch = async (url) => {
        const value = String(url);
        if (value.includes("/7001") && value.includes("$expand=relations")) {
          return new Promise((resolve) => {
            window.resolveDocumentCopyFetch = () => resolve({
              ok: true,
              async json() {
                window.documentCopyFetchCompleted = true;
                return { relations: [] };
              },
            });
          });
        }
        throw new Error(`Unexpected document-copy cancellation request: ${value}`);
      };
      document.addEventListener("copy", () => {
        window.nativeDocumentCopyCount += 1;
        window.copiedPayload = { plainText: "native-document-copy", rich: false };
      }, { once: true });
    });
    const beforeDocumentCopyWrites = await page.evaluate(() => window.clipboardWriteCount);
    await asyncCopyA.click();
    await page.waitForFunction(() => typeof window.resolveDocumentCopyFetch === "function");
    await page.evaluate(() => {
      document.dispatchEvent(new ClipboardEvent("copy", { bubbles: true, cancelable: true }));
      window.resolveDocumentCopyFetch();
    });
    await page.waitForFunction(() => window.documentCopyFetchCompleted);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await page.evaluate(() => window.nativeDocumentCopyCount), 1);
    assert.equal(await page.evaluate(() => window.clipboardWriteCount), beforeDocumentCopyWrites,
      "a native document copy cancels an enhanced request waiting on parent data");
    assert.equal((await page.evaluate(() => window.copiedPayload)).plainText, "native-document-copy",
      "the canceled enhanced request cannot overwrite the native document copy");

    await page.evaluate(() => {
      window.azureNicetiesTestSettings = { dataConsent: true, includeParent: false, branchPrefix: "feature" };
    });
    await asyncCopyA.click();
    await page.waitForFunction(() => window.copiedPayload?.plainText === "Bug 7001: Slow parent lookup");
    const beforeCompletedNativeCopyWrites = await page.evaluate(() => window.clipboardWriteCount);
    await page.evaluate(() => {
      document.addEventListener("copy", () => {
        window.copiedPayload = { plainText: "newer native selected text", rich: false };
      }, { once: true });
      document.dispatchEvent(new ClipboardEvent("copy", { bubbles: true, cancelable: true }));
    });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal((await page.evaluate(() => window.copiedPayload)).plainText, "newer native selected text",
      "native text copying immediately after an enhanced copy stays final");
    assert.equal(await page.evaluate(() => window.clipboardWriteCount), beforeCompletedNativeCopyWrites,
      "a completed enhanced copy does not schedule any delayed clipboard writes");
    await page.evaluate(() => {
      window.azureNicetiesTestSettings = { dataConsent: true, includeParent: true, branchPrefix: "feature" };
    });

    await page.evaluate(() => {
      window.retryParentAttempts = 0;
      window.fetch = async (url) => {
        const value = String(url);
        if (value.includes("/8001") && value.includes("$expand=relations")) {
          window.retryParentAttempts += 1;
          if (window.retryParentAttempts === 1) return { ok: false };
          return {
            ok: true,
            async json() {
              return {
                relations: [{
                  rel: "System.LinkTypes.Hierarchy-Reverse",
                  url: "https://dev.azure.com/example/_apis/wit/workItems/9001",
                }],
              };
            },
          };
        }
        if (value.includes("/9001")) {
          return {
            ok: true,
            async json() {
              return {
                id: 9001,
                fields: { "System.Title": "Recovered parent", "System.WorkItemType": "Feature" },
                _links: { html: { href: "https://dev.azure.com/example/project/_workitems/edit/9001" } },
              };
            },
          };
        }
        throw new Error(`Unexpected parent retry request: ${value}`);
      };
    });
    await retryParentCopy.click();
    await page.waitForFunction(() => window.copiedPayload?.plainText === "Task 8001: Retry parent lookup");
    await retryParentCopy.click();
    await page.waitForFunction(() => window.copiedPayload?.plainText?.startsWith("Feature 9001"));
    assert.equal(await page.evaluate(() => window.retryParentAttempts), 2,
      "a transient parent failure is retried on the next copy");

    await page.evaluate(() => {
      window.crossOrgChildRequests = [];
      window.fetch = async (url, options) => {
        window.crossOrgChildRequests.push({ url: String(url), credentials: options?.credentials });
        throw new Error(`Unexpected cross-organization request: ${url}`);
      };
    });
    await crossOrgACopy.click();
    await page.waitForFunction(() => window.copiedPayload?.plainText === "Task 8100: Organization A child");
    await crossOrgBCopy.click();
    await page.waitForFunction(() => window.copiedPayload?.plainText === "Task 8100: Organization B child");
    assert.deepEqual(await page.evaluate(() => window.crossOrgChildRequests), [],
      "copying a link to another organization keeps child-only context and makes no credentialed requests");

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/options/options.html`);
    await popup.getByRole("heading", { name: "Azure DevOps Niceties" }).waitFor();
    await popup.getByLabel("Include parent context").check();
    await popup.getByLabel("Branch prefix").fill("Feature Work");
    await popup.getByLabel("Branch prefix").blur();
    await popup.locator("#status").getByText("Saved", { exact: true }).waitFor();
    assert.equal(await popup.getByLabel("Branch prefix").inputValue(), "feature-work");

    await popup.evaluate(() => {
      window.originalStorageSet = chrome.storage.sync.set;
      chrome.storage.sync.set = async () => { throw new Error("Storage unavailable"); };
    });
    try {
      await popup.getByLabel("Branch prefix").fill("Bug Fix");
      await popup.getByLabel("Branch prefix").blur();
      await popup.getByText("Could not save settings: Storage unavailable", { exact: true }).waitFor();
      assert.equal(await popup.evaluate(async () => (await chrome.storage.sync.get("branchPrefix")).branchPrefix),
        "feature-work", "a failed save does not claim to persist the new prefix");
    } finally {
      await popup.evaluate(() => { chrome.storage.sync.set = window.originalStorageSet; });
    }
    await popup.getByLabel("Branch prefix").fill("Feature Work");
    await popup.getByLabel("Branch prefix").blur();
    await popup.getByText("Saved", { exact: true }).waitFor();

    const beforeHiddenShortcut = await page.evaluate(() => window.copiedPayload);
    await hiddenHoverCopy.hover();
    await page.locator(".hidden-hover-card").evaluate((element) => { element.style.display = "none"; });
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press("Shift+Alt+c");
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.deepEqual(await page.evaluate(() => window.copiedPayload), beforeHiddenShortcut,
      "hidden but connected hovered cards are not keyboard shortcut targets");

    await page.evaluate(() => {
      document.querySelectorAll(".work-item-form-page:not(#current-visible-form)").forEach((form) => {
        form.hidden = true;
      });
      document.querySelectorAll("[data-work-item-id], [data-item-id], [role='row']").forEach((container) => {
        container.dataset.formFallbackPreviousHidden = String(container.hidden);
        container.hidden = true;
      });
      window.location.hash = "/_workitems/edit/8401";
      document.activeElement?.blur();
    });
    assert.deepEqual(await page.evaluate(() => ({
      oldVisible: document.querySelector("#retained-old-form").checkVisibility(),
      currentVisible: document.querySelector("#current-visible-form").checkVisibility(),
      currentTitle: document.querySelector("#current-visible-form input[aria-label='Title field']").value,
    })), {
      oldVisible: false,
      currentVisible: true,
      currentTitle: "Current visible form",
    }, "retained-form fixture has one hidden old form and one visible current form");
    const beforeFormFallbackWrites = await page.evaluate(() => window.clipboardWriteCount);
    await page.keyboard.press("Shift+Alt+c");
    await page.waitForFunction(
      (before) => window.clipboardWriteCount > before,
      beforeFormFallbackWrites,
      { timeout: 5000 }
    );
    assert.equal((await page.evaluate(() => window.copiedPayload)).plainText, "PBI 8401: Current visible form",
      "form fallback skips retained hidden forms and copies the visible current form");
    assert.equal(await page.evaluate(() => window.nativeCopyClicks["current-visible-form-copy"] || 0), 0,
      "form fallback skips retained hidden forms and targets the visible current form");
    await page.evaluate(() => {
      document.querySelectorAll("[data-form-fallback-previous-hidden]").forEach((container) => {
        container.hidden = container.dataset.formFallbackPreviousHidden === "true";
        delete container.dataset.formFallbackPreviousHidden;
      });
      window.location.hash = "";
    });

    const beforeDetachedShortcut = await page.evaluate(() => window.copiedPayload);
    await firstCopy.hover();
    await page.mouse.move(1, 1);
    await page.locator(".wit-card").first().evaluate((element) => element.remove());
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press("Shift+Alt+c");
    assert.deepEqual(await page.evaluate(() => window.copiedPayload), beforeDetachedShortcut, "detached hovered cards are not copied after SPA navigation");
    assert.equal(await page.evaluate(() => window.copiedEventCount), 0, "copy payload is not exposed to page scripts");

    const result = await page.evaluate(() => ({
      copiedPayload: window.copiedPayload,
      nativeCopyClicks: window.nativeCopyClicks,
    }));
    assert.equal(result.nativeCopyClicks["1234"] || 0, 0, "enhanced card copy suppressed Azure DevOps's native handler");
    assert.equal(result.nativeCopyClicks["2345"] || 0, 0, "editable work-item copy suppressed Azure DevOps's native handler");
    await runThemeSmoke(browser, extensionId);
    await runSelectionSummarySmoke(browser, extensionId, process.env.AZURE_NICETIES_SUMMARY_SCREENSHOTS);
    console.log(JSON.stringify({ ok: true, ...result, optionsVerified: true }, null, 2));
  } finally {
    if (!providedBrowser) await closeBrowser();
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", terminate);
  }
}

module.exports = { runBrowserSmoke: main };

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
