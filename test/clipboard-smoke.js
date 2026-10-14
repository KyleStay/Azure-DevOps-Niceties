const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

async function runClipboardSmoke(browser, extensionId) {
  const context = browser.contexts()[0];
  const url = "https://dev.azure.com/example/project/_workitems/edit/94001";
  const fixture = fs.readFileSync(path.join(__dirname, "clipboard-fixture.html"), "utf8");
  const route = (request) => request.fulfill({ status: 200, contentType: "text/html", body: fixture });
  await context.route(url, route);
  const page = await context.newPage();
  const options = await context.newPage();
  let originalConsent;
  try {
    await options.goto(`chrome-extension://${extensionId}/options/options.html`);
    await options.waitForFunction(() => !document.querySelector("#data-consent").disabled);
    originalConsent = await options.locator("#data-consent").isChecked();
    await options.locator("#data-consent").check();
    await options.waitForFunction(async () => (await chrome.storage.local.get("dataConsent")).dataConsent === true);
    await options.locator("#include-parent").uncheck();
    await options.locator("#branch-prefix").fill("feature");
    await options.locator("#branch-prefix").blur();
    await options.waitForFunction(async () => (await chrome.storage.sync.get("branchPrefix")).branchPrefix === "feature");
    await page.goto(url);
    await page.bringToFront();
    const button = page.getByRole("button", { name: "Copy work item to clipboard" });
    await button.hover();
    await page.waitForFunction(() => document.querySelector(".wit-card button")?.dataset.azureNicetiesEnhanced === "true");
    for (const [modifiers, expected, rich] of [
      [[], "PBI 94001: Paste across apps", true],
      [["Shift"], `[PBI 94001: Paste across apps](${url})`, false],
      [["Alt"], "#94001", false],
      [[process.platform === "darwin" ? "Meta" : "Control"], url, false],
      [["Shift", "Alt"], "feature/94001-paste-across-apps", false],
    ]) {
      await page.evaluate(() => {
        const range = document.createRange();
        range.selectNodeContents(document.querySelector(".wit-card"));
        const selection = getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      });
      await button.click({ modifiers });
      try {
        await page.waitForFunction((label) => document.querySelector(".wit-card button")?.dataset.azureNicetiesCopiedLabel === label, expected, { timeout: 5000 });
      } catch (error) {
        const state = await button.evaluate((control) => ({ copied: control.dataset.azureNicetiesCopiedLabel,
          enhanced: control.dataset.azureNicetiesEnhanced, title: document.querySelector(".work-item-title").textContent }));
        throw new Error(`Copy failed for ${JSON.stringify(modifiers)}: ${JSON.stringify(state)} (${error.message})`);
      }
      const payload = await page.evaluate(async () => {
        const [item] = await navigator.clipboard.read({ unsanitized: ["text/html"] });
        const result = {};
        for (const type of item.types) {
          if (type === "text/plain" || type === "text/html") result[type] = await (await item.getType(type)).text();
        }
        return result;
      });
      assert.equal(payload["text/plain"], expected, "system clipboard has exactly one clean line");
      assert.equal(/[\r\n\t\u2028\u2029]/.test(payload["text/plain"]), false);
      if (rich) {
        const shape = await page.evaluate((html) => {
          const doc = new DOMParser().parseFromString(html, "text/html");
          return { text: doc.body.textContent, links: doc.querySelectorAll("a").length,
            blocks: doc.body.querySelectorAll("p,div,br,table,ul,ol,li").length,
            fonts: doc.querySelectorAll("font,[style*='font' i]").length, html };
        }, payload["text/html"]);
        assert.equal(shape.text, expected, JSON.stringify(shape));
        assert.equal(shape.links, 1);
        assert.equal(shape.blocks, 0, JSON.stringify(shape));
        assert.equal(shape.fonts, 0, JSON.stringify(shape));
      } else assert.equal(payload["text/html"], undefined, "plain copy does not retain prior rich markup");
      const pasteKey = process.platform === "darwin" ? "Meta+V" : "Control+V";
      const plain = page.getByRole("textbox", { name: "Plain text destination" });
      await plain.fill("");
      await plain.focus();
      await page.keyboard.press(pasteKey);
      assert.equal(await plain.inputValue(), expected);
      if (rich) {
        for (const [selector, font] of [["#rich", "Arial"], ["#cell", "Verdana"]]) {
          const target = page.locator(selector);
          await target.fill("");
          await target.focus();
          await page.keyboard.press(pasteKey);
          assert.equal(await target.innerText(), expected);
          assert.equal(await target.locator("a").getAttribute("href"), url);
          assert.equal(await target.locator("a").evaluate((link) => getComputedStyle(link).fontFamily), font,
            "link inherits the destination font");
          assert.equal(await target.locator("br,p,div").count(), 0, "no blank rows or paragraph wrappers are pasted");
        }
      }
    }
    console.log(JSON.stringify({ clipboardSmoke: "passed", variants: 5, realPaste: "rich editor, table cell, plain textarea", font: "destination inherited" }));
  } finally {
    if (originalConsent !== undefined) await options.evaluate(async (value) => chrome.storage.local.set({ dataConsent: value }), originalConsent).catch(() => {});
    await page.close();
    await options.close();
    await context.unroute(url, route);
  }
}

module.exports = { runClipboardSmoke };
