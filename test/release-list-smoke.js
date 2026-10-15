const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

async function runReleaseListSmoke(browser, extensionId) {
  const context = browser.contexts()[0];
  const url = "https://dev.azure.com/example/project/_releaseProgress?releaseId=50&environmentId=3&_a=workitems";
  const route = (request) => request.fulfill({ status: 200, contentType: "text/html",
    body: fs.readFileSync(path.join(__dirname, "release-list-fixture.html"), "utf8") });
  await context.route(url, route);
  const categoriesUrl = "https://dev.azure.com/example/project/_apis/wit/workitemtypecategories?api-version=7.1";
  const categoriesRoute = request => request.fulfill({ json: { value: [
    { referenceName: "Microsoft.RequirementCategory", workItemTypes: [{ name: "Product Backlog Item" }, { name: "User Story" }] },
    { referenceName: "Microsoft.BugCategory", workItemTypes: [{ name: "Bug" }] },
  ] } });
  await context.route(categoriesUrl, categoriesRoute);
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
    const originalViewport = page.viewportSize();
    for (const width of [360, 796, 1100]) {
      await page.setViewportSize({ width, height: 800 });
      const layout = await page.locator("#items").evaluate(table => ({
        width: table.getBoundingClientRect().width,
        available: table.parentElement.clientWidth - 48,
        overflow: table.scrollWidth > table.clientWidth || document.documentElement.scrollWidth > document.documentElement.clientWidth,
      }));
      assert.ok(Math.abs(layout.width - layout.available) < 2, "release table fills its container after resizing");
      assert.equal(layout.overflow, false, "release table does not create horizontal scrolling");
    }
    await page.setViewportSize(originalViewport || { width: 1280, height: 800 });
    assert.equal(await page.locator("#items thead tr > :nth-child(2) [aria-label='Select all loaded work items']").count(), 1, "select-all follows Copy");
    assert.equal(await page.locator("#items tbody tr > :first-child").evaluateAll(cells => cells.every(cell => cell.dataset.azureNicetiesReleaseColumn === "copy")), true, "every table row starts with Copy");
    assert.equal(await page.locator("#items colgroup > col").count(), 5, "native table colgroups include selection and copy columns");
    assert.equal(await page.locator("#items thead tr > :first-child").getAttribute("aria-label"), "Copy", "Copy header has an accessible label");
    assert.equal(await page.locator("#items tbody tr [data-azure-niceties-release-copy='item']").evaluateAll(buttons => buttons.every(button => button.parentElement === button.closest("tr").firstElementChild && !button.textContent && button.querySelector("svg[aria-hidden='true']"))), true, "Copy buttons use labelled icons in the first column");
    assert.equal(await page.locator("#items [data-azure-niceties-release-field='type']").evaluateAll(cells => cells.every(cell => getComputedStyle(cell).display === "none")), true, "native type columns are hidden");
    await options.locator("#data-consent").uncheck();
    await options.waitForFunction(async () => (await chrome.storage.local.get("dataConsent")).dataConsent === false);
    await page.locator(selector).waitFor({ state: "detached" });
    assert.equal(await page.locator("[data-azure-niceties-release-list],[data-azure-niceties-release-field]").count(), 0, "opting out restores native fields and table layout");
    assert.equal(await page.locator("#items").evaluate(table => table.getBoundingClientRect().width), 480, "native table width is restored on opt-out");
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
    const quickCopies = [
      ["bugs-and-backlog", "Copy all bugs + backlog items (3)", "#501\n#502\n#503"],
      ["backlog", "Copy all backlog items (2)", "#501\n#502"],
    ];
    for (const [kind, name, expectedIds] of quickCopies) {
      const button = page.getByRole("button", { name, exact: true });
      await button.click({ modifiers: ["Alt"] });
      await page.waitForFunction(kind => document.querySelector(`[data-azure-niceties-release-copy='${kind}']`)?.dataset.azureNicetiesCopied === "true", kind);
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), expectedIds, "quick copy excludes unrelated types and duplicate rows");
    }
    assert.equal(await page.getByRole("button", { name: "Copy selected (0)", exact: true }).isDisabled(), true, "quick copy does not alter manual selection");
    await page.locator("#items tbody tr").evaluateAll(rows => {
      for (const index of [3, 4]) rows[index].querySelectorAll("td:not([data-azure-niceties-release-column])")[1].textContent = "Task";
    });
    await page.getByRole("checkbox", { name: "Select Task work items", exact: true }).check();
    await page.getByRole("button", { name: "Copy selected (1)", exact: true }).waitFor();
    await page.getByRole("button", { name: "Copy selected (1)", exact: true }).click();
    await page.waitForFunction(() => document.querySelector("[data-azure-niceties-release-copy='selected']").dataset.azureNicetiesCopied === "true");
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "Task 504: Verify release", "type selection follows the first representation of duplicate IDs");
    await page.getByRole("button", { name: "Clear selection", exact: true }).click();
    await page.locator("#items tbody tr").evaluateAll(rows => {
      rows[3].querySelectorAll("td:not([data-azure-niceties-release-column])")[1].textContent = "Test Case";
      rows[4].querySelectorAll("td:not([data-azure-niceties-release-column])")[1].textContent = "Product Backlog Item";
    });
    await page.getByRole("checkbox", { name: "Select TC work items", exact: true }).waitFor();
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
    await page.getByRole("checkbox", { name: "Select PBI work items", exact: true }).check();
    await page.getByRole("checkbox", { name: "Select Bug work items", exact: true }).check();
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
    const legacyUrl = "https://dev.azure.com/example/project/_releaseProgress?releaseId=51&environmentId=3&_a=workitems";
    const legacyRoute = request => request.fulfill({ status: 200, contentType: "text/html",
      body: fs.readFileSync(path.join(__dirname, "release-list-legacy-fixture.html"), "utf8") });
    await context.route(legacyUrl, legacyRoute);
    try {
      await page.goto(legacyUrl);
      await page.getByRole("button", { name: "Copy all loaded (2)", exact: true }).waitFor();
      for (const width of [360, 836, 1280]) {
        await page.setViewportSize({ width, height: 940 });
        const layout = await page.locator("#legacy-items").evaluate(grid => {
          const panel = grid.closest("[role='dialog']").getBoundingClientRect();
          const rows = [...grid.querySelectorAll("[data-azure-niceties-release-column-layout]")];
          return {
            gridWidth: grid.getBoundingClientRect().width,
            panelWidth: panel.width,
            overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth || grid.scrollWidth > grid.clientWidth,
            columns: rows.map(row => {
              const cell = field => row.querySelector(`[data-azure-niceties-release-field='${field}']`);
              return {
                titleWidth: cell("title").getBoundingClientRect().width,
                titleStart: cell("title").getBoundingClientRect().left,
                stateEnd: cell("state").getBoundingClientRect().right,
                typeHidden: getComputedStyle(cell("type")).display === "none",
                titleVisible: getComputedStyle(cell("title")).display !== "none",
              };
            }),
          };
        });
        assert.ok(Math.abs(layout.gridWidth - layout.panelWidth) < 2, "legacy grid stretches through the narrow group to fill the panel");
        assert.equal(layout.overflow, false, "legacy virtual canvases do not create horizontal scrolling");
        assert.ok(layout.columns.every(column => column.typeHidden && column.titleVisible && column.titleWidth > 40 && Math.abs(column.titleStart - column.stateEnd) < 2), "Title remains visible after State despite decorations and native flex rules");
        assert.ok(layout.columns.every(column => Math.abs(column.titleStart - layout.columns[0].titleStart) < 2), "legacy header and body columns align");
        if (width === 836) await page.screenshot({ path: "/private/tmp/azure-release-legacy-layout.png" });
      }
      await page.setViewportSize(originalViewport || { width: 1280, height: 800 });
      await options.locator("#data-consent").uncheck();
      await page.locator(selector).waitFor({ state: "detached" });
      assert.equal(await page.locator("[data-azure-niceties-release-width],[data-azure-niceties-release-field]").count(), 0, "native canvas and field styles are restored on opt-out");
      assert.equal(await page.locator(".release-group").evaluate(group => group.getBoundingClientRect().width), 360, "the group's native width is restored");
      await options.locator("#data-consent").check();
    } finally { await context.unroute(legacyUrl, legacyRoute); }
    const demoUrl = "https://dev.azure.com/example/project/_release?releaseId=50&environmentId=3&_a=workitems";
    const demoRoute = request => request.fulfill({ status: 200, contentType: "text/html", body: fs.readFileSync(path.join(__dirname, "release-list-demo.html"), "utf8") });
    await context.route(demoUrl, demoRoute);
    try {
      await page.goto(demoUrl);
      await page.getByRole("button", { name: "Copy all loaded (4)", exact: true }).waitFor();
      await page.locator("#items, #items [role='row']").evaluateAll(elements => {
        for (const element of elements) element.style.cssText = "width: 700px; max-width: 700px";
      });
      const gridLayout = await page.locator("#items").evaluate(grid => ({
        width: grid.getBoundingClientRect().width,
        available: grid.parentElement.clientWidth,
        rows: [...grid.querySelectorAll("[role='row']")].map(row => row.getBoundingClientRect().width),
      }));
      assert.ok(Math.abs(gridLayout.width - gridLayout.available) < 2, "release grid fills its container");
      assert.ok(gridLayout.rows.every(width => Math.abs(width - (gridLayout.width - 2)) < 2), "grid headers and rows fill the expanded grid");
      assert.equal(await page.locator("#items [role='row'] > :first-child").evaluateAll(cells => cells.every(cell => cell.dataset.azureNicetiesReleaseColumn === "copy")), true, "ARIA grids start with Copy");
      assert.equal(await page.locator("#items [role='row'] > :nth-child(2)").evaluateAll(cells => cells.every(cell => cell.dataset.azureNicetiesReleaseColumn === "select")), true, "selection follows Copy");
      for (const width of [360, 796, 1280]) {
        await page.setViewportSize({ width, height: 800 });
        const compact = await page.locator("#items [role='row']").evaluateAll(rows => rows.map(row => {
          const box = field => row.querySelector(`[data-azure-niceties-release-field='${field}']`).getBoundingClientRect();
          const copy = row.querySelector("[data-azure-niceties-release-column='copy']").getBoundingClientRect();
          return { overflow: row.scrollWidth > row.clientWidth, stateEnd: box("state").right, titleStart: box("title").left, copyStart: copy.left, rowStart: row.getBoundingClientRect().left };
        }));
        assert.ok(compact.every(row => !row.overflow && row.stateEnd <= row.titleStart && Math.abs(row.copyStart - row.rowStart) < 1), "compact grid fits with Copy leftmost and State before Title");
      }
      await page.setViewportSize(originalViewport || { width: 1280, height: 800 });
      const copyCenters = await page.locator("#items [data-azure-niceties-release-column='copy']").evaluateAll(cells => cells.map(cell => {
        const box = cell.getBoundingClientRect(); return box.x + box.width / 2;
      }));
      assert.ok(copyCenters.every(center => Math.abs(center - copyCenters[0]) < 1), "Copy column header and cells align");
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
      await page.getByRole("checkbox", { name: "Select PBI work items", exact: true }).check();
      await page.getByRole("checkbox", { name: "Select Bug work items", exact: true }).check();
      assert.equal(await page.getByRole("checkbox", { name: "Select Task work items", exact: true }).isChecked(), false, "choosing Bugs and PBIs leaves Tasks out");
      assert.equal(await page.getByRole("checkbox", { name: "Select US work items", exact: true }).isChecked(), false);
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
      await page.getByRole("checkbox", { name: "Select Bug work items", exact: true }).uncheck();
      await page.getByRole("button", { name: "Copy selected (1)", exact: true }).waitFor();
      assert.equal(await page.getByRole("checkbox", { name: "Select Bug work items", exact: true }).isDisabled(), true, "empty type controls remain stable while rows are unloaded");
      await page.locator("#items").evaluate((grid, html) => grid.insertAdjacentHTML("beforeend", html.join("")), originals);
      await page.getByRole("button", { name: "Copy all loaded (4)", exact: true }).waitFor();
      await page.getByRole("checkbox", { name: "Select Bug work items", exact: true }).check();
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
      await page.locator("#items [role='row']").evaluateAll(rows => {
        rows[2].querySelectorAll("[role='gridcell']:not([data-azure-niceties-release-column])")[1].textContent = "PBI";
        rows[4].querySelectorAll("[role='gridcell']:not([data-azure-niceties-release-column])")[1].textContent = "Release Check";
      });
      await page.getByRole("checkbox", { name: "Select Release Check work items", exact: true }).waitFor();
      assert.equal(await page.getByRole("checkbox", { name: "Select PBI work items", exact: true }).count(), 1, "long and abbreviated types share a choice");
      await page.getByRole("checkbox", { name: "Select PBI work items", exact: true }).check();
      await page.waitForFunction(() => document.querySelector("[data-azure-niceties-summary] > summary")?.textContent === "2 selected · Effort: 8");
      await page.getByRole("checkbox", { name: "Select PBI 601: Improve search results", exact: true }).uncheck();
      assert.equal(await page.getByRole("checkbox", { name: "Select PBI work items", exact: true }).evaluate(input => input.indeterminate), true, "manual partial selections update the type checkbox");
      await page.getByRole("checkbox", { name: "Select PBI work items", exact: true }).focus();
      await page.keyboard.press("Space");
      await page.getByRole("button", { name: "Copy selected (2)", exact: true }).waitFor();
      await page.locator("[data-azure-niceties-release-copy='selected']").evaluate(button => delete button.dataset.azureNicetiesCopied);
      await page.evaluate(() => getSelection().removeAllRanges());
      await page.keyboard.press(process.platform === "darwin" ? "Meta+C" : "Control+C");
      await page.waitForFunction(() => document.querySelector("[data-azure-niceties-release-copy='selected']").dataset.azureNicetiesCopied === "true");
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "PBI 601: Improve search results\nPBI 602: Save filters", "copy from a type control uses the selected items");
      await page.getByRole("checkbox", { name: "Select PBI work items", exact: true }).uncheck();
      await page.getByRole("checkbox", { name: "Select Release Check work items", exact: true }).check();
      await page.getByRole("button", { name: "Copy selected (1)", exact: true }).click();
      await page.waitForFunction(() => document.querySelector("[data-azure-niceties-release-copy='selected']").dataset.azureNicetiesCopied === "true");
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "Release Check 604: Update deployment notes", "custom work-item types select and copy correctly");
      await page.getByRole("button", { name: "Clear selection", exact: true }).click();
      await page.locator("#items [role='row']").evaluateAll(rows => {
        rows[2].querySelectorAll("[role='gridcell']:not([data-azure-niceties-release-column])")[1].textContent = "User Story";
        rows[4].querySelectorAll("[role='gridcell']:not([data-azure-niceties-release-column])")[1].textContent = "Task";
      });
      await page.locator("#items [role='row']").first().evaluate(row => { row.removeAttribute("role"); row.className = "grid-header"; });
      await page.waitForTimeout(250);
      assert.equal(await page.locator("#items .grid-header > :nth-child(2) [aria-label='Select all loaded work items']").count(), 1, "legacy headers keep select-all after Copy");
      await page.getByRole("checkbox", { name: "Select all loaded work items", exact: true }).check();
      await page.getByRole("button", { name: "Copy selected (4)", exact: true }).waitFor();
      await options.locator("#data-consent").uncheck();
      await page.waitForFunction(() => !document.querySelector("[data-azure-niceties-release-column]"));
      assert.equal(await page.locator("[data-azure-niceties-release-types]").count(), 0, "type selection is removed on opt-out");
      assert.equal(await page.locator("[data-azure-niceties-release-column-layout],[data-azure-niceties-release-column-relative]").count(), 0, "opting out restores native grid row layout");
    } finally { await context.unroute(demoUrl, demoRoute); }
    console.log(JSON.stringify({ releaseListSmoke: "passed", variants: 4, rows: "deduped, hidden/unsafe/ambiguous excluded", realPaste: "one clean linked line per item" }));
  } finally {
    await options.evaluate(async () => chrome.storage.local.set({ dataConsent: false })).catch(() => {});
    await page.close();
    await options.close();
    await context.unroute(url, route);
    await context.unroute(categoriesUrl, categoriesRoute);
  }
}

module.exports = { runReleaseListSmoke };
