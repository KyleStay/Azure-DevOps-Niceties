const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

async function runReleaseBoltSmoke(browser, extensionId) {
  const context = browser.contexts()[0];
  const page = await context.newPage();
  const options = await context.newPage();
  const url = "https://dev.azure.com/example/project/_releaseProgress?releaseId=53&_a=workitems";
  const categoryUrl = "https://dev.azure.com/example/project/_apis/wit/workitemtypecategories?api-version=7.1";
  const titlePattern = /^https:\/\/dev\.azure\.com\/example\/_apis\/wit\/workitems\?/;
  const titleRequests = [];
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  const writes = [];
  const recovered = "Restore <release> & work-item titles";
  const fixtureRoute = request => request.fulfill({ contentType: "text/html", body: fs.readFileSync(path.join(__dirname, "release-list-bolt-fixture.html"), "utf8") });
  const categoryRoute = request => request.fulfill({ json: { value: [
    { referenceName: "Microsoft.RequirementCategory", workItemTypes: [{ name: "Product Backlog Item" }] },
  ] } });
  const titleRoute = async route => {
    const request = route.request(); const query = new URL(request.url()).searchParams;
    titleRequests.push(query.get("ids"));
    assert.equal(request.method(), "GET");
    assert.equal(query.get("fields"), "System.Id,System.Title");
    const ids = query.get("ids").split(",").map(Number);
    if (ids.includes(901)) return route.fulfill({ status: 403, json: { message: "Permission denied" } });
    return route.fulfill({ json: { value: ids.map(id => ({ id, fields: { "System.Id": id, "System.Title": id === 701 ? recovered : `Recovered title ${id}` } })) } });
  };
  const observe = request => { if (request.method() === "PATCH") writes.push(request.url()); };
  let saved;
  await context.route(url, fixtureRoute); await context.route(categoryUrl, categoryRoute); await context.route(titlePattern, titleRoute);
  context.on("request", observe);
  try {
    await options.goto(`chrome-extension://${extensionId}/options/options.html`);
    await options.waitForFunction(() => !document.querySelector("#data-consent").disabled && !document.querySelector("#inline-state-editing").disabled);
    saved = await options.evaluate(() => chrome.storage.local.get(["dataConsent", "inlineStateEditing"]));
    await options.locator("#data-consent").check(); await options.locator("#inline-state-editing").check();
    await page.goto(url);
    await page.getByRole("button", { name: `Copy PBI 701: ${recovered}`, exact: true }).waitFor();
    await page.waitForFunction(() => document.querySelectorAll("#bolt-items [data-azure-niceties-state-trigger]").length === 35);
    const first = page.locator("#bolt-items tbody tr").first();
    await page.evaluate(() => { window.initialNativeTitle = document.querySelector("tbody tr .title-link a"); });
    assert.equal(await first.locator(".title-link a").textContent(), "", "recovery does not overwrite React's empty native link");
    assert.equal(await first.locator("[data-azure-niceties-release-actions] a").textContent(), recovered);
    assert.ok((await first.locator("[data-azure-niceties-release-actions] a").getAttribute("class")).includes("bolt-link"));
    assert.deepEqual(titleRequests, ["701"], "only the missing title is requested, once");
    assert.equal(await page.locator("tbody tr").nth(1).locator(".title-link a").textContent(), "Done", "a title matching a state name is never blanked");
    for (const width of [360, 836, 1280]) {
      await page.setViewportSize({ width, height: 940 });
      const layout = await page.locator("#bolt-items").evaluate(table => {
        const rows = [...table.querySelectorAll("tr")];
        return { width: table.getBoundingClientRect().width, available: document.querySelector(".stage-frame").getBoundingClientRect().width,
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          heights: rows.map(row => row.getBoundingClientRect().height),
          spacers: [...table.querySelectorAll("[role='presentation']")].map(cell => ({ display: getComputedStyle(cell).display, width: cell.getBoundingClientRect().width })),
          ids: rows.map(row => row.querySelector("[data-column-index='0']")?.dataset.azureNicetiesReleaseField),
          titles: rows.map(row => { const box = row.querySelector("[data-azure-niceties-release-field='title']")?.getBoundingClientRect(); return box && { x: box.x, width: box.width }; }),
          links: [...table.querySelectorAll("tbody .title-link")].slice(1).map(link => link.getBoundingClientRect().width),
          states: [...table.querySelectorAll("tbody [data-azure-niceties-release-field='state']")].map(cell => cell.textContent.trim()),
          labels: [...table.querySelectorAll("[data-azure-niceties-release-copy='item']")].map(button => button.getAttribute("aria-label")),
          headerLabels: ["state", "title"].map(field => {
            const cell = table.querySelector(`thead [data-azure-niceties-release-field='${field}']`);
            const range = document.createRange(); range.selectNodeContents(cell.firstChild);
            return { start: range.getBoundingClientRect().left, expected: cell.getBoundingClientRect().left + parseFloat(getComputedStyle(cell).paddingLeft) };
          }),
        };
      });
      assert.ok(Math.abs(layout.width - layout.available) < 2); assert.equal(layout.overflow, false);
      assert.ok(layout.heights.every(height => height <= 38), "native inner padding and header margins do not double the compact row height");
      assert.ok(layout.spacers.every(cell => cell.display === "none" && cell.width === 0), "Bolt spacers consume zero layout width");
      assert.ok(layout.ids.every(field => field === "id"), "the leading spacer cannot steal ID's index");
      assert.ok(layout.titles.every(box => box && box.width > 120 && Math.abs(box.x - layout.titles[0].x) < 2), "native header and all Title cells align and receive available width");
      assert.ok(layout.links.every(width => width > 80), "the native work-item-small-view/title-link flex chain stays readable");
      assert.ok(layout.states.every(state => state === "Done"));
      assert.ok(layout.labels.every(label => !/:\s*$/.test(label)), "no blank title copy labels remain");
      assert.ok(layout.headerLabels.every(label => Math.abs(label.start - label.expected) < 2), "header text starts at its column's left padding instead of floating in the center");
      await page.screenshot({ path: path.join(os.tmpdir(), `azure-release-bolt-${width}.png`) });
    }
    await page.getByRole("button", { name: "Copy all loaded (35)", exact: true }).click();
    await page.waitForFunction(() => document.querySelector("[data-azure-niceties-copy-list]")?.dataset.azureNicetiesCopied === "true");
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    assert.equal(copied.split("\n").length, 35); assert.equal(copied.split("\n")[0], `PBI 701: ${recovered}`);
    await options.locator("#inline-state-editing").uncheck();
    await page.waitForFunction(() => !document.querySelector("#bolt-items [data-azure-niceties-state-trigger]"));
    assert.equal(await page.locator("tbody tr").nth(1).locator(".title-link a").textContent(), "Done");
    await options.locator("#inline-state-editing").check();
    await page.waitForFunction(() => document.querySelectorAll("#bolt-items [data-azure-niceties-state-trigger]").length === 35);
    await first.locator(".title-link a").evaluate(link => { link.textContent = "Native refreshed title"; });
    await page.getByRole("button", { name: "Copy PBI 701: Native refreshed title", exact: true }).waitFor();
    assert.equal(await first.locator("[data-azure-niceties-release-title-fallback]").count(), 0, "native title takes over when Azure DevOps renders it");
    assert.equal(await page.evaluate(() => window.initialNativeTitle === document.querySelector("tbody tr .title-link a")), true);
    await first.evaluate(row => { row.querySelector("[data-column-index='0'] .text-ellipsis").textContent = "999"; const link = row.querySelector(".title-link a"); link.href = link.href.replace("701", "999"); link.textContent = ""; });
    await page.getByRole("button", { name: "Copy PBI 999: Recovered title 999", exact: true }).waitFor();
    assert.deepEqual(titleRequests, ["701", "999"], "recycled rows never reuse another item's title");
    await first.evaluate(row => { row.querySelector("[data-column-index='0'] .text-ellipsis").textContent = "901"; const link = row.querySelector(".title-link a"); link.href = link.href.replace("999", "901"); });
    await first.getByRole("link", { name: "Title unavailable — open item", exact: true }).waitFor();
    assert.equal(await first.getByRole("button", { name: "Copy PBI 901", exact: true }).isDisabled(), true);
    assert.equal(await page.getByRole("button", { name: "Copy all loaded (35)", exact: true }).isDisabled(), true, "incomplete bulk copies cannot silently omit a row");
    assert.deepEqual(writes, [], "title recovery performs no work-item writes");
    await options.locator("#data-consent").uncheck();
    await page.waitForFunction(() => !document.querySelector("[data-azure-niceties-release-toolbar]"));
    assert.equal(await page.locator("[data-azure-niceties-release-title-fallback],[data-azure-niceties-release-content]").count(), 0);
    console.log(JSON.stringify({ releaseBoltRow: "passed", rows: 35, widths: [360,836,1280], cases: "supplied spacers, ID indexing, native flex chain, empty-title GET recovery, no native title mutation, state-label title preservation, recycling, permissions, no writes, opt-out" }));
  } catch (error) {
    console.log(JSON.stringify({ releaseBoltDiagnosis: await page.evaluate(() => ({
      text: document.body.innerText.slice(0, 1500),
      firstRow: document.querySelector("tbody tr")?.outerHTML.slice(0, 8000),
      headers: [...document.querySelectorAll("thead th")].map(cell => ({ text: cell.textContent, field: cell.dataset.azureNicetiesReleaseField })),
    })), titleRequests, pageErrors }));
    await page.screenshot({ path: path.join(os.tmpdir(), "azure-release-bolt-failure.png") }).catch(() => {});
    throw error;
  } finally {
    if (saved) await options.evaluate(async previous => {
      await chrome.storage.local.remove(["dataConsent", "inlineStateEditing"]);
      await chrome.storage.local.set(previous);
    }, saved).catch(() => {});
    context.off("request", observe);
    await page.close(); await options.close();
    await context.unroute(url, fixtureRoute); await context.unroute(categoryUrl, categoryRoute); await context.unroute(titlePattern, titleRoute);
  }
}

module.exports = { runReleaseBoltSmoke };
