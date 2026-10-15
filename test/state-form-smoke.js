const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

async function runStateFormSmoke(browser, extensionId) {
  const context = browser.contexts()[0];
  const page = await context.newPage();
  const options = await context.newPage();
  const url = "https://dev.azure.com/example/project/_queries/query/state-form";
  const itemPattern = "https://dev.azure.com/example/_apis/wit/workitems/**";
  const typePattern = "https://dev.azure.com/example/project/_apis/wit/workitemtypes/**";
  const item = { state: "New", rev: 4 };
  const patches = [];
  const fixture = route => route.fulfill({ contentType: "text/html", body: fs.readFileSync(path.join(__dirname, "state-form-fixture.html"), "utf8") });
  const itemRoute = route => {
    if (route.request().method() === "PATCH") {
      const patch = route.request().postDataJSON(); patches.push(patch);
      assert.deepEqual(patch[0], { op: "test", path: "/rev", value: item.rev });
      assert.equal(patch.length, 2);
      assert.equal(patch[1].path, "/fields/System.State");
      item.rev++; item.state = patch[1].value;
    }
    return route.fulfill({ json: { id: 701, rev: item.rev, fields: { "System.Id": 701, "System.State": item.state, "System.WorkItemType": "Bug", "System.TeamProject": "project" } } });
  };
  const typeRoute = route => route.fulfill({ json: { name: "Bug", states: [{ name: "New" }, { name: "Active" }, { name: "Closed" }], transitions: { New: [{ to: "Active" }], Active: [{ to: "Closed" }] } } });
  let previous;
  try {
    await context.route(url, fixture); await context.route(itemPattern, itemRoute); await context.route(typePattern, typeRoute);
    await options.goto(`chrome-extension://${extensionId}/options/options.html`);
    await options.waitForFunction(() => !document.querySelector("#inline-state-editing").disabled);
    previous = await options.evaluate(async () => chrome.storage.local.get(["inlineStateEditing", "dataConsent", "selectionSummary"]));
    await options.evaluate(async () => chrome.storage.local.set({ inlineStateEditing: true, dataConsent: false, selectionSummary: false }));
    await page.goto(url);
    await page.bringToFront();
    const menu = page.locator("[data-azure-niceties-state-menu]");
    await page.getByRole("button", { name: "Change state of work item 701, currently New", exact: true }).click();
    await menu.getByRole("option", { name: "Active", exact: true }).click();
    await menu.waitFor({ state: "detached" });
    assert.equal(patches.length, 1);
    assert.equal(await page.evaluate(() => window.formFixture.moduleLoads), 0, "native form modules are not loaded during list editing");
    await page.locator("#open-item").click();
    await page.waitForFunction(() => document.querySelector("#form-state").textContent === "Active");
    assert.equal(await page.evaluate(() => window.formFixture.refreshes), 1, "opening a stale clean form refreshes its native model");
    assert.equal(patches.length, 1, "refresh does not issue a second write");
    await page.screenshot({ path: path.join(os.tmpdir(), "azure-state-form-refresh.png") });

    await page.locator("#form-title").fill("Unsaved title that must survive");
    const before = await page.evaluate(() => window.formFixture.dirtyChecks);
    await page.getByRole("button", { name: "Change state of work item 701, currently Active", exact: true }).click();
    await menu.getByRole("option", { name: "Closed", exact: true }).click();
    await menu.waitFor({ state: "detached" });
    await page.waitForFunction(before => window.formFixture.dirtyChecks > before, before);
    assert.equal(await page.locator("#form-state").textContent(), "Active", "a dirty form is left untouched");
    assert.equal(await page.locator("#form-title").inputValue(), "Unsaved title that must survive");
    assert.equal(await page.evaluate(() => window.formFixture.refreshes), 1);
    assert.equal(patches.length, 2, "only the two explicit State choices send writes");
    await page.evaluate(() => { window.formFixture.dirty = false; }); // User resolves their independent edit.
    await page.waitForFunction(() => document.querySelector("#form-state").textContent === "Closed");
    assert.equal(await page.evaluate(() => window.formFixture.refreshes), 2);
    assert.equal(patches.length, 2);
    console.log(JSON.stringify({ nativeStateFormRefresh: "passed", cases: "late-opened cached form, updated native revision, dirty-form preservation, refresh after edits resolved, no additional writes", nativeApi: "mocked documented WorkItemFormService contract" }));
  } finally {
    if (previous) await options.evaluate(async previous => {
      await chrome.storage.local.remove(["inlineStateEditing", "dataConsent", "selectionSummary"]);
      await chrome.storage.local.set(previous);
    }, previous).catch(() => {});
    await page.close(); await options.close();
    await context.unroute(url, fixture); await context.unroute(itemPattern, itemRoute); await context.unroute(typePattern, typeRoute);
  }
}
module.exports = { runStateFormSmoke };
