const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

async function runSelectionSummarySmoke(browser, extensionId, screenshotDirectory) {
  const context = browser.contexts()[0];
  const url = "https://dev.azure.com/example/_queries/selection-fixture";
  const fixture = fs.readFileSync(path.join(__dirname, "selection-summary-fixture.html"), "utf8");
  const requests = [];
  const route = (request) => request.fulfill({ status: 200, contentType: "text/html", body: fixture });
  await context.route(url, route);
  const page = await context.newPage();
  const popup = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => requests.push(request.url()));
  const panel = page.locator("[data-azure-niceties-summary]");
  const heading = panel.locator("summary");
  const waitHeading = (expected) => page.waitForFunction((value) =>
    document.querySelector("[data-azure-niceties-summary] > summary")?.textContent === value, expected);
  try {
    await popup.goto(`chrome-extension://${extensionId}/options/options.html`);
    await popup.waitForFunction(() => !document.querySelector("#selection-summary").disabled);
    assert.equal(await popup.locator("#selection-summary").isChecked(), true, "summary defaults on with no saved preference");
    await page.goto(url);
    await waitHeading("3 selected · Effort: 8.5 (partial)");
    await popup.locator("#selection-summary").uncheck();
    await panel.waitFor({ state: "detached" });
    await page.reload();
    await page.waitForTimeout(200);
    assert.equal(await panel.count(), 0, "saved opt-out survives reload");
    await popup.locator("#selection-summary").check();
    await popup.getByText("Selection summary enabled", { exact: true }).waitFor();
    await waitHeading("3 selected · Effort: 8.5 (partial)");
    assert.match(await panel.innerText(), /Effort: 8.5 total · 2\/3 estimated · 1 missing/);
    assert.match(await panel.innerText(), /User Story: 2 · Bug: 1/);
    assert.match(await panel.innerText(), /New: 2 · Active: 1/);
    assert.match(await panel.innerText(), /Unassigned: 2/);
    if (screenshotDirectory) {
      fs.mkdirSync(screenshotDirectory, { recursive: true });
      await page.screenshot({ path: path.join(screenshotDirectory, "selection-summary-light.png") });
      await page.emulateMedia({ colorScheme: "dark" });
      await page.screenshot({ path: path.join(screenshotDirectory, "selection-summary-dark.png") });
    }
    await page.locator("#duplicate").evaluate((row) => { row.hidden = false; row.classList.add("selected"); });
    await page.waitForTimeout(200);
    assert.equal(await heading.textContent(), "3 selected · Effort: 8.5 (partial)", "duplicate representations count once");
    await page.locator("#duplicate").evaluate((row) => { row.hidden = true; });
    await page.locator("#effort-a").evaluate((cell) => { cell.textContent = "4"; });
    await waitHeading("3 selected · Effort: 9.5 (partial)");
    await heading.click();
    await page.locator("#story-c").evaluate((row) => row.setAttribute("aria-selected", "false"));
    await waitHeading("2 selected · Effort: 9.5");
    assert.equal(await panel.getAttribute("open"), null, "collapse state survives selection updates");
    await heading.click();
    await page.locator("#story-zero").evaluate((row) => row.setAttribute("aria-selected", "true"));
    await waitHeading("3 selected · Effort: 9.5");
    assert.match(await panel.innerText(), /3\/3 estimated/);
    await page.locator("#backlog-row").evaluate((row) => row.classList.add("grid-row-selected"));
    await waitHeading("4 selected · Effort: 9.5 (partial)");
    assert.match(await panel.innerText(), /Story Points: 8 total · 1\/4 estimated/);
    await page.locator("#row-checkbox").check();
    await waitHeading("5 selected · Effort: 9.5 (partial)");
    await page.locator("#row-checkbox").uncheck();
    await page.locator("#backlog-row").evaluate((row) => row.classList.remove("grid-row-selected"));
    await page.locator("[aria-selected='true']").evaluateAll((rows) => rows.forEach((row) => row.setAttribute("aria-selected", "false")));
    await panel.waitFor({ state: "detached" });
    await page.locator("#story-a").evaluate((row) => row.setAttribute("aria-selected", "true"));
    await waitHeading("1 selected · Effort: 4");
    await popup.locator("#selection-summary").uncheck();
    await popup.getByText("Selection summary disabled", { exact: true }).waitFor();
    await panel.waitFor({ state: "detached" });
    await page.locator("#story-b").evaluate((row) => row.setAttribute("aria-selected", "true"));
    await page.waitForTimeout(200);
    assert.equal(await panel.count(), 0, "disabling stops selection processing");
    assert.deepEqual(errors, []);
    assert.deepEqual(requests, [url, url], "only the initial navigation and explicit reload make network requests");
    console.log(JSON.stringify({ selectionSummarySmoke: "passed" }));
  } finally {
    await page.close();
    await popup.close();
    await context.unroute(url, route);
  }
}

module.exports = { runSelectionSummarySmoke };
