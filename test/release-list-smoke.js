const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

async function runReleaseListSmoke(browser, extensionId) {
  const context = browser.contexts()[0];
  const url = "https://dev.azure.com/example/project/_releaseProgress?releaseId=50&environmentId=3&_a=workitems";
  const route = (request) => request.fulfill({ status: 200, contentType: "text/html",
    body: fs.readFileSync(path.join(__dirname, "release-list-fixture.html"), "utf8") });
  await context.route(url, route);
  const page = await context.newPage();
  const options = await context.newPage();
  const selector = "[data-azure-niceties-copy-list]";
  try {
    await options.goto(`chrome-extension://${extensionId}/options/options.html`);
    await options.waitForFunction(() => !document.querySelector("#data-consent").disabled);
    await options.evaluate(async () => chrome.storage.local.remove("dataConsent"));
    await options.reload();
    await options.waitForFunction(() => !document.querySelector("#data-consent").disabled);
    assert.equal(await options.locator("#data-consent").isChecked(), true, "copying starts enabled with no saved preference");
    await page.goto(url);
    await page.getByRole("button", { name: "Copy all loaded (4)", exact: true }).waitFor();
    assert.equal(await page.locator("#items thead tr > :first-child [aria-label='Select all loaded work items']").count(), 1, "select-all is in the first header column");
    assert.equal(await page.locator("#items tbody tr > :first-child").evaluateAll(cells => cells.every(cell => cell.hasAttribute("data-azure-niceties-release-column"))), true, "every table row has its own first selection cell");
    assert.equal(await page.locator("#items colgroup > col").count(), 4, "native table colgroups include the selection column");
    await options.locator("#data-consent").uncheck();
    await options.waitForFunction(async () => (await chrome.storage.local.get("dataConsent")).dataConsent === false);
    await page.goto(url);
    await page.waitForTimeout(200);
    assert.equal(await page.locator(selector).count(), 0, "saved copying opt-out survives reload");
    assert.equal(await page.locator("[data-azure-niceties-release-column]").count(), 0, "opting out removes the selection column");
    assert.equal(await page.locator("#items colgroup > col").count(), 3, "opting out restores native table columns");
    await page.getByRole("button", { name: "Enable copying", exact: true }).evaluate(button => button.click());
    assert.equal(await options.evaluate(async () => (await chrome.storage.local.get({ dataConsent: false })).dataConsent), false, "synthetic clicks cannot approve copying");
    await page.getByRole("button", { name: "Enable copying", exact: true }).click();
    await options.waitForFunction(async () => (await chrome.storage.local.get("dataConsent")).dataConsent === true);
    await options.reload();
    await options.waitForFunction(() => !document.querySelector("#data-consent").disabled);
    await options.locator("#include-parent").uncheck();
    await page.getByRole("button", { name: "Copy all loaded (4)", exact: true }).waitFor();
    await page.screenshot({ path: "/private/tmp/azure-release-list.png" });
    await page.bringToFront();
    const expected = "PBI 501: Improve search results\nUS 502: US 502 accessibility requirement\nBug 503: Fix <empty> results & paging\nTC 504: Verify release";
    const pasteKey = process.platform === "darwin" ? "Meta+V" : "Control+V";
    for (const [modifiers, plain, rich] of [
      [[], expected, true],
      [["Alt"], "#501\n#502\n#503\n#504", false],
      [[process.platform === "darwin" ? "Meta" : "Control"], [501, 502, 503, 504].map(id => `https://dev.azure.com/example/project/_workitems/edit/${id}`).join("\n"), false],
      [["Shift"], expected.split("\n").map((label, index) => `[${label.replace(/&/g, "&amp;").replace("<empty>", "&lt;empty&gt;")}](${`https://dev.azure.com/example/project/_workitems/edit/${501 + index}`})`).join("\n"), false],
    ]) {
      await page.locator(selector).click({ modifiers });
      await page.waitForFunction(() => document.querySelector("[data-azure-niceties-copy-list]").dataset.azureNicetiesCopied === "true");
      const payload = await page.evaluate(async () => {
        const [item] = await navigator.clipboard.read({ unsanitized: ["text/html"] });
        return Object.fromEntries(await Promise.all(item.types.filter(type => /^text\/(plain|html)$/.test(type))
          .map(async type => [type, await (await item.getType(type)).text()])));
      });
      assert.equal(payload["text/plain"], plain);
      assert.equal(payload["text/plain"].split("\n").length, 4, "exactly one row per work item");
      assert.equal(/\n\n|^\s|\s$/.test(payload["text/plain"]), false);
      if (rich) {
        const shape = await page.evaluate(html => {
          const doc = new DOMParser().parseFromString(html, "text/html");
          return { links: doc.querySelectorAll("a").length, breaks: doc.querySelectorAll("br").length,
            wrappers: doc.querySelectorAll("p,div,table,font,[style]").length };
        }, payload["text/html"]);
        assert.deepEqual(shape, { links: 4, breaks: 3, wrappers: 0 });
        await page.locator("#destination").focus();
        await page.keyboard.press(pasteKey);
        assert.equal(await page.locator("#destination").innerText(), plain);
        assert.equal(await page.locator("#destination a").count(), 4);
        assert.equal(await page.locator("#destination a").first().evaluate(link => getComputedStyle(link).fontFamily), "Verdana");
        await page.waitForTimeout(200);
        assert.equal(await page.locator(selector).count(), 1, "pasted editable links are not another release list");
      } else assert.equal(payload["text/html"], undefined);
      await page.getByRole("textbox", { name: "Plain destination", exact: true }).fill("");
      await page.getByRole("textbox", { name: "Plain destination", exact: true }).focus();
      await page.keyboard.press(pasteKey);
      assert.equal(await page.getByRole("textbox", { name: "Plain destination", exact: true }).inputValue(), plain);
      await page.locator(selector).evaluate(button => delete button.dataset.azureNicetiesCopied);
    }
    const rows = page.locator("#items tbody tr");
    await rows.nth(0).getByRole("checkbox").check();
    await rows.nth(2).getByRole("checkbox").check();
    const selected = page.getByRole("button", { name: "Copy selected (2)", exact: true });
    await selected.waitFor();
    assert.equal(await page.getByRole("checkbox", { name: "Select all loaded work items", exact: true }).evaluate(control => control.indeterminate), true);
    const selectedText = expected.split("\n").filter((_, index) => index === 0 || index === 2).join("\n");
    await selected.click();
    await selected.evaluate(button => delete button.dataset.azureNicetiesCopied);
    await rows.nth(0).getByRole("checkbox").focus();
    await page.evaluate(() => getSelection().removeAllRanges());
    await page.keyboard.press(process.platform === "darwin" ? "Meta+C" : "Control+C");
    await page.waitForFunction(() => document.querySelector("[data-azure-niceties-release-copy='selected']").dataset.azureNicetiesCopied === "true");
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), selectedText, "selected-list keyboard copy uses clean references");
    await page.getByRole("button", { name: "Clear selection", exact: true }).click();
    assert.equal(await page.getByRole("button", { name: "Copy selected (0)", exact: true }).isDisabled(), true);
    await rows.nth(0).getByRole("button", { name: "Copy PBI 501: Improve search results", exact: true }).click();
    await page.waitForFunction(() => document.querySelector("#items tbody tr [data-azure-niceties-release-copy='item']").dataset.azureNicetiesCopied === "true");
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), expected.split("\n")[0], "individual release-row copy has no added UI labels");
    await page.getByRole("checkbox", { name: "Select all loaded work items", exact: true }).check();
    assert.equal(await page.getByRole("button", { name: "Copy selected (4)", exact: true }).count(), 1, "duplicates select once");
    await page.getByRole("button", { name: "Clear selection", exact: true }).click();
    await page.locator("#items tbody tr").nth(1).evaluate(row => { row.hidden = true; });
    await page.getByRole("button", { name: "Copy all loaded (3)", exact: true }).waitFor();
    await options.locator("#data-consent").uncheck();
    await page.locator(selector).waitFor({ state: "detached" });
    await options.locator("#data-consent").check();
    await page.locator(selector).waitFor();
    await page.evaluate(() => { history.pushState({}, "", "/example/project/_boards/board"); dispatchEvent(new PopStateEvent("popstate")); });
    await page.locator(selector).waitFor({ state: "detached" });
    const demoUrl = "https://dev.azure.com/example/project/_release?releaseId=50&environmentId=3&_a=workitems";
    const demoRoute = request => request.fulfill({ status: 200, contentType: "text/html", body: fs.readFileSync(path.join(__dirname, "release-list-demo.html"), "utf8") });
    await context.route(demoUrl, demoRoute);
    try {
      await page.goto(demoUrl);
      await page.getByRole("button", { name: "Copy all loaded (4)", exact: true }).waitFor();
      assert.equal(await page.locator("#items [role='row'] > :first-child").evaluateAll(cells => cells.every(cell => cell.hasAttribute("data-azure-niceties-release-column"))), true, "ARIA grids have a dedicated first selection column");
      const centers = await page.locator("#items [data-azure-niceties-release-column] input").evaluateAll(inputs => inputs.map(input => {
        const box = input.getBoundingClientRect(); return box.x + box.width / 2;
      }));
      assert.ok(centers.every(center => Math.abs(center - centers[0]) < 1), "header and row checkboxes align");
      await page.getByRole("checkbox", { name: "Select all loaded work items", exact: true }).check();
      await page.getByRole("button", { name: "Copy selected (4)", exact: true }).waitFor();
      await page.getByRole("checkbox", { name: "Select all loaded work items", exact: true }).uncheck();
      await page.getByRole("button", { name: "Copy selected (0)", exact: true }).waitFor();
      assert.equal(await page.locator("[data-azure-niceties-release-actions] a").count(), 4, "linkless cells get safe Open links");
      assert.equal(await page.locator("[data-azure-niceties-release-actions] a").first().getAttribute("href"), "https://dev.azure.com/example/project/_workitems/edit/601");
      await page.getByRole("checkbox", { name: "Select PBI 601: Improve search results", exact: true }).check();
      await page.getByRole("checkbox", { name: "Select Bug 603: Fix empty results", exact: true }).check();
      await page.waitForFunction(() => document.querySelector("[data-azure-niceties-summary] > summary")?.textContent === "2 selected · Effort: 7");
      assert.equal(await page.locator("[data-azure-niceties-summary]").evaluate(panel => panel.closest("[role='dialog']")?.getAttribute("aria-label")), "Stage work items", "summary stays in the release stage sheet stacking context");
      assert.equal(await page.evaluate(() => window.nativeRowClicks), 0, "owned selection controls do not activate native row clicks");
      await page.locator("textarea").evaluate(textarea => { textarea.hidden = true; });
      await page.screenshot({ path: "/private/tmp/azure-release-selection-demo.png" });
      await page.getByRole("button", { name: "Copy selected (2)", exact: true }).click();
      await page.waitForFunction(() => document.querySelector("[data-azure-niceties-release-copy='selected']").dataset.azureNicetiesCopied === "true");
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "PBI 601: Improve search results\nBug 603: Fix empty results");
      await page.locator("#items").evaluate(grid => { grid.hidden = true; });
      await page.locator("[data-azure-niceties-release-toolbar]").waitFor({ state: "hidden" });
      await page.locator("#items").evaluate(grid => { grid.hidden = false; });
      await page.getByRole("button", { name: "Copy selected (2)", exact: true }).waitFor();
      const originals = await page.locator("#items [role='row']").evaluateAll(rows => rows.slice(1).map(row => {
        const copy = row.cloneNode(true);
        copy.querySelectorAll("[data-azure-niceties-release-actions]").forEach(node => node.remove());
        copy.querySelectorAll("[data-azure-niceties-release-column]").forEach(node => node.remove());
        copy.removeAttribute("data-azure-niceties-release-column-layout"); copy.removeAttribute("data-azure-niceties-release-column-relative");
        copy.removeAttribute("data-azure-niceties-release-row"); copy.removeAttribute("data-azure-niceties-release-selected");
        return copy.outerHTML;
      }));
      await page.locator("#items").evaluate(grid => [...grid.querySelectorAll("[role='row']")].slice(1).forEach(row => row.remove()));
      await page.getByRole("button", { name: "Copy all loaded (0)", exact: true }).waitFor();
      assert.equal(await page.getByRole("button", { name: "Copy selected (2)", exact: true }).isEnabled(), true, "temporarily unloaded selected rows remain available");
      await page.locator("#items").evaluate((grid, html) => grid.insertAdjacentHTML("beforeend", html.join("")), originals);
      await page.getByRole("button", { name: "Copy all loaded (4)", exact: true }).waitFor();
      await page.waitForFunction(() => document.querySelector("[data-azure-niceties-summary] > summary")?.textContent === "2 selected · Effort: 7");
      await page.locator("#items [role='row']").nth(3).evaluate(row => {
        const cells = row.querySelectorAll("[role='gridcell']:not([data-azure-niceties-release-column])");
        cells[0].textContent = "605";
        cells[1].innerHTML = '<span aria-label="Work item type: Test Case"></span>';
        cells[2].textContent = "Verify smoke test";
      });
      const recycled = page.getByRole("button", { name: "Copy TC 605: Verify smoke test", exact: true });
      await recycled.waitFor();
      const recycledRow = page.locator("#items [role='row']").nth(3);
      assert.equal(await recycledRow.locator("[data-azure-niceties-release-actions] a").getAttribute("href"), "https://dev.azure.com/example/project/_workitems/edit/605");
      await recycled.click();
      await recycledRow.getByRole("checkbox", { name: "Select TC 605: Verify smoke test", exact: true }).check();
      await page.waitForFunction(() => document.querySelector("[data-azure-niceties-summary]")?.textContent.includes("Test Case: 1"));
      await recycledRow.evaluate(row => { row.querySelector("[role='gridcell']:not([data-azure-niceties-release-column])").innerHTML = '<a href="/example/project/_workitems/edit/605">605</a>'; });
      await recycledRow.locator("[data-azure-niceties-release-actions] a").waitFor({ state: "detached" });
      await recycledRow.evaluate(row => { row.setAttribute("data-item-id", "999"); row.setAttribute("aria-selected", "true"); });
      await page.getByRole("button", { name: "Copy all loaded (3)", exact: true }).waitFor();
      await page.waitForFunction(() => document.querySelector("[data-azure-niceties-summary] > summary")?.textContent === "1 selected · Effort: 5");
      await recycledRow.evaluate(row => { row.removeAttribute("data-item-id"); row.setAttribute("aria-selected", "false"); });
      await page.getByRole("button", { name: "Copy all loaded (4)", exact: true }).waitFor();
      await page.evaluate(() => {
        window.nativeCopyShortcuts = 0;
        document.querySelector("#items").addEventListener("keydown", event => {
          if ((event.ctrlKey || event.metaKey) && event.code === "KeyC") { window.nativeCopyShortcuts++; event.preventDefault(); }
        });
      });
      await recycledRow.locator("[role='gridcell'] a").focus();
      await page.keyboard.press(process.platform === "darwin" ? "Meta+C" : "Control+C");
      assert.equal(await page.evaluate(() => window.nativeCopyShortcuts), 1, "ordinary copy on a native control remains native");
      await page.getByRole("button", { name: "Clear selection", exact: true }).click();
      await page.getByRole("checkbox", { name: "Select PBI 601: Improve search results", exact: true }).check();
      await page.getByRole("checkbox", { name: "Select PBI 601: Improve search results", exact: true }).focus();
      await page.keyboard.press("Space");
      assert.equal(await page.getByRole("button", { name: "Copy selected (0)", exact: true }).count(), 1, "Space toggles a selected row without navigation");
      await page.locator("[data-azure-niceties-summary]").waitFor({ state: "detached" });
      await page.locator("#items [role='row']").first().evaluate(row => { row.removeAttribute("role"); row.className = "grid-header"; });
      await page.waitForTimeout(250);
      assert.equal(await page.locator("#items .grid-header > :first-child [aria-label='Select all loaded work items']").count(), 1, "legacy headers keep select-all in their first column");
      await page.getByRole("checkbox", { name: "Select all loaded work items", exact: true }).check();
      await page.getByRole("button", { name: "Copy selected (4)", exact: true }).waitFor();
      await options.locator("#data-consent").uncheck();
      await page.waitForFunction(() => !document.querySelector("[data-azure-niceties-release-column]"));
      assert.equal(await page.locator("[data-azure-niceties-release-column-layout],[data-azure-niceties-release-column-relative]").count(), 0, "opting out restores native grid row layout");
    } finally { await context.unroute(demoUrl, demoRoute); }
    console.log(JSON.stringify({ releaseListSmoke: "passed", variants: 4, rows: "deduped, hidden/unsafe/ambiguous excluded", realPaste: "one clean linked line per item" }));
  } finally {
    await options.evaluate(async () => chrome.storage.local.set({ dataConsent: false })).catch(() => {});
    await page.close();
    await options.close();
    await context.unroute(url, route);
  }
}

module.exports = { runReleaseListSmoke };
