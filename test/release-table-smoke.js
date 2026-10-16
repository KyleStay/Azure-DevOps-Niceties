const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

async function runReleaseTableSmoke(browser, extensionId) {
  const context = browser.contexts()[0], page = await context.newPage(), options = await context.newPage();
  const url = "https://dev.azure.com/example/project/_releaseProgress?releaseId=54&_a=workitems";
  const fieldsUrl = "https://dev.azure.com/example/_apis/wit/fields?api-version=7.1";
  const itemsPattern = /^https:\/\/dev\.azure\.com\/example\/_apis\/wit\/workitems\?/;
  const categoryUrl = "https://dev.azure.com/example/project/_apis/wit/workitemtypecategories?api-version=7.1";
  const qa = { name: "Assigned QA PBI", referenceName: "Custom.AssignedQAPBI", type: "string" };
  const fields = [qa, { name: "Description", referenceName: "System.Description", type: "html" }, { name: "Effort", referenceName: "Microsoft.VSTS.Scheduling.Effort", type: "double" }];
  const reads = [], writes = [], fieldReads = [];
  let deny = false, delay = false, reply;
  const fixture = fs.readFileSync(path.join(__dirname, "release-list-bolt-fixture.html"), "utf8")
    .replace("index < 35", "index < 3").replace('index === 0 ? "" :', 'index === 0 ? "Native title 701" :').replace("35 work items", "3 work items");
  const fixtureRoute = route => route.fulfill({ contentType: "text/html", body: fixture });
  const fieldRoute = route => { fieldReads.push(route.request().url()); return route.fulfill({ json: { value: fields } }); };
  const categoryRoute = route => route.fulfill({ json: { value: [{ referenceName: "Microsoft.RequirementCategory", workItemTypes: [{ name: "Product Backlog Item" }] }] } });
  const itemsRoute = async route => {
    const request = route.request(), query = new URL(request.url()).searchParams;
    assert.equal(request.method(), "GET"); assert.equal(query.get("errorPolicy"), "Fail");
    const ids = query.get("ids").split(",").map(Number);
    const extra = query.get("fields").split(",").find(name => !["System.Id", "System.Title", "System.State"].includes(name));
    assert.ok(fields.some(field => field.referenceName === extra));
    reads.push({ ids, extra });
    if (delay) await new Promise(resolve => { reply = resolve; });
    if (deny) return route.fulfill({ status: 403, json: { message: "Denied" } });
    await route.fulfill({ json: { value: ids.slice().reverse().map(id => ({ id, fields: {
      "System.Id": id, "System.Title": id === 701 ? "Fix <copy> & table\nlayout" : `Saved title ${id}`,
      "System.State": id === 701 ? "Active" : "Done",
      [extra]: extra === qa.referenceName ? (id === 701 ? { displayName: "QA Person", uniqueName: "qa@example.test" } : id === 702 ? null : "=1+1")
        : extra === "System.Description" ? "First<div>Second &amp; third<br>Fourth</div><script>bad()</script><img src='https://invalid.example.test/tracker'>"
          : 0,
    } })) } }).catch(() => {});
  };
  const observe = request => { if (request.method() === "PATCH") writes.push(request.url()); };
  let saved;
  await context.route(url, fixtureRoute); await context.route(fieldsUrl, fieldRoute);
  await context.route(itemsPattern, itemsRoute); await context.route(categoryUrl, categoryRoute);
  context.on("request", observe);
  try {
    await options.goto(`chrome-extension://${extensionId}/options/options.html`);
    await options.waitForFunction(() => !document.querySelector("#data-consent").disabled && !document.querySelector("#inline-state-editing").disabled);
    saved = await options.evaluate(() => chrome.storage.local.get(["dataConsent", "inlineStateEditing"]));
    await options.locator("#data-consent").check(); await options.locator("#inline-state-editing").uncheck();
    await page.goto(url);
    await page.getByRole("button", { name: "Copy all loaded (3)", exact: true }).waitFor();
    assert.equal(fieldReads.length, 0, "no field catalog or extra values read until the table menu is opened");
    assert.equal(reads.length, 0);
    const summary = page.locator("[data-azure-niceties-release-menu='table'] > summary");
    const form = page.locator("[data-azure-niceties-release-table]");
    const button = form.getByRole("button", { name: "Copy table", exact: true });
    const field = form.getByLabel("Additional field", { exact: true });
    const rows = form.getByLabel("Rows", { exact: true });
    const status = form.getByRole("status");
    await summary.click(); await button.waitFor();
    await page.waitForFunction(() => !document.querySelector("[data-azure-niceties-release-copy='table']").disabled);
    assert.equal(fieldReads.length, 1); assert.equal(reads.length, 0);
    assert.equal(await form.locator(`option[value='${qa.referenceName}']`).getAttribute("label"), qa.name);
    await field.fill(qa.name);
    for (const width of [360, 836]) {
      await page.setViewportSize({ width, height: 940 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      const box = await form.boundingBox(); assert.ok(box.x >= 0 && box.x + box.width <= width);
      await page.screenshot({ path: path.join(os.tmpdir(), `azure-release-table-${width}.png`) });
    }
    await button.click();
    await page.getByText("Copied 3 rows. Select a cell in Excel and paste.", { exact: true }).waitFor();
    const expected = "Title\tState\tAssigned QA PBI\r\nFix <copy> & table layout\tActive\tQA Person\r\nSaved title 702\tDone\t\r\nSaved title 703\tDone\t'=1+1";
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), expected);
    assert.deepEqual(reads, [{ ids: [701, 702, 703], extra: qa.referenceName }]);
    await page.evaluate(() => {
      const plain = document.createElement("textarea"); plain.id = "paste-table-plain";
      const rich = document.createElement("div"); rich.id = "paste-table-rich"; rich.contentEditable = "true";
      document.body.append(plain, rich);
    });
    const pasteKey = process.platform === "darwin" ? "Meta+V" : "Control+V";
    await page.locator("#paste-table-plain").focus(); await page.keyboard.press(pasteKey);
    assert.equal(await page.locator("#paste-table-plain").inputValue(), expected.replace(/\r\n/g, "\n"));
    await page.locator("#paste-table-rich").focus(); await page.keyboard.press(pasteKey);
    const pasted = await page.locator("#paste-table-rich").evaluate(host => ({
      cells: [...host.querySelectorAll("tr")].map(row => [...row.querySelectorAll("th,td")].map(cell => cell.textContent)),
      unsafe: host.querySelectorAll("script,img,iframe").length,
    }));
    assert.deepEqual(pasted.cells, expected.split("\r\n").map(row => row.split("\t")));
    assert.equal(pasted.unsafe, 0);
    // Close the popup before selecting the rows it covers, then retain the field choice.
    await summary.click();
    await page.locator("tbody tr").nth(0).locator("[data-azure-niceties-release-select]").check();
    await page.locator("tbody tr").nth(2).locator("[data-azure-niceties-release-select]").check();
    await summary.click(); await page.waitForFunction(() => !document.querySelector("[data-azure-niceties-release-copy='table']").disabled);
    await rows.selectOption("selected"); await button.click();
    await page.getByText("Copied 2 rows. Select a cell in Excel and paste.", { exact: true }).waitFor();
    assert.deepEqual(reads.at(-1).ids, [701, 703]);
    assert.equal((await page.evaluate(() => navigator.clipboard.readText())).split("\r\n").length, 3);
    await field.fill("System.Description"); await button.click();
    await page.waitForFunction(() => document.querySelector("[data-azure-niceties-release-copy='table']")?.dataset.azureNicetiesCopiedLabel === "2 work items as a table");
    await page.waitForFunction(async () => (await navigator.clipboard.readText()).startsWith("Title\tState\tDescription"));
    assert.ok((await page.evaluate(() => navigator.clipboard.readText())).includes("First Second & third Fourth"));
    assert.equal((await page.evaluate(() => navigator.clipboard.readText())).includes("bad()"), false);
    await field.fill("Effort"); await button.click();
    await page.waitForFunction(async () => (await navigator.clipboard.readText()).startsWith("Title\tState\tEffort"));
    assert.ok((await page.evaluate(() => navigator.clipboard.readText())).endsWith("\t0"));
    const before = await page.evaluate(() => navigator.clipboard.readText());
    deny = true; await button.click();
    await page.getByText("Could not read the table fields. Check your Azure DevOps access and try again.", { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), before, "permission failure does not replace the clipboard");
    deny = false; delay = true; await button.click();
    await page.waitForFunction(() => document.querySelector("[data-azure-niceties-release-table-status]").textContent === "Reading table values…");
    for (let attempt = 0; !reply && attempt < 50; attempt++) await page.waitForTimeout(20);
    assert.ok(reply); await summary.click(); reply(); await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), before, "closing the menu cancels a pending table copy");
    delay = false;
    await summary.click(); await page.waitForFunction(() => !document.querySelector("[data-azure-niceties-release-copy='table']").disabled);
    assert.equal(await field.isDisabled(), false, "closing an in-flight copy does not leave inputs disabled on reopen");
    assert.equal(await rows.isDisabled(), false);
    await options.locator("#data-consent").uncheck();
    await page.waitForFunction(() => !document.querySelector("[data-azure-niceties-release-table]"));
    assert.deepEqual(writes, []);
    console.log(JSON.stringify({ releaseTable: "passed", cases: "custom-field choice, no eager reads, current saved states, exact HTML/TSV clipboard + native paste, blank/identity/formula/rich-text/numeric values, selected rows, permission failure, cancellation, opt-out" }));
  } catch (error) {
    console.log(JSON.stringify({ releaseTableDiagnosis: await page.locator("[data-azure-niceties-release-toolbar]").textContent().catch(() => "missing toolbar"), reads, fieldReads }));
    await page.screenshot({ path: path.join(os.tmpdir(), "azure-release-table-failure.png") }).catch(() => {});
    throw error;
  } finally {
    reply?.();
    if (saved) await options.evaluate(async previous => { await chrome.storage.local.remove(["dataConsent", "inlineStateEditing"]); await chrome.storage.local.set(previous); }, saved).catch(() => {});
    context.off("request", observe);
    await page.close(); await options.close();
    await context.unroute(url, fixtureRoute); await context.unroute(fieldsUrl, fieldRoute);
    await context.unroute(itemsPattern, itemsRoute); await context.unroute(categoryUrl, categoryRoute);
  }
}
module.exports = { runReleaseTableSmoke };
