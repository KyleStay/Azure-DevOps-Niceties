const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

async function runStateListSmoke(browser, extensionId) {
  const context = browser.contexts()[0];
  const page = await context.newPage();
  const options = await context.newPage();
  const views = [
    ["release", "https://dev.azure.com/example/project/_releaseProgress?releaseId=50&_a=workitems"],
    ["sprint-backlog", "https://dev.azure.com/example/project/_sprints/backlog/team/iteration"],
    ["backlog", "https://dev.azure.com/example/project/_backlogs/backlog/team/Backlog%20items"],
  ];
  const fixture = route => route.fulfill({ contentType: "text/html", body: fs.readFileSync(path.join(__dirname, "state-list-fixture.html"), "utf8") });
  const itemPattern = "https://dev.azure.com/example/_apis/wit/workitems/**";
  const typePattern = "https://dev.azure.com/example/project/_apis/wit/workitemtypes/**";
  const items = new Map([720, 721, 722, 725].map(id => [id, { state: "New", rev: 4 }]));
  const patches = [];
  let reads = 0;
  const itemRoute = route => {
    const id = Number(new URL(route.request().url()).pathname.split("/").pop());
    const item = items.get(id);
    assert.ok(item, "only identified sample items can be requested");
    if (route.request().method() === "PATCH") {
      const body = route.request().postDataJSON();
      assert.deepEqual(body, [{ op: "test", path: "/rev", value: item.rev }, { op: "add", path: "/fields/System.State", value: "Active" }]);
      patches.push(id); item.rev++; item.state = "Active";
    } else reads++;
    return route.fulfill({ json: { id, rev: item.rev, fields: { "System.Id": id, "System.State": item.state, "System.WorkItemType": "Bug", "System.TeamProject": "project" } } });
  };
  const typeRoute = route => route.fulfill({ json: { name: "Bug", states: [{ name: "New" }, { name: "Active" }], transitions: { New: [{ to: "Active" }], Active: [{ to: "New" }] } } });
  let previous;
  try {
    for (const [, url] of views) await context.route(url, fixture);
    await context.route(itemPattern, itemRoute);
    await context.route(typePattern, typeRoute);
    await options.goto(`chrome-extension://${extensionId}/options/options.html`);
    await options.waitForFunction(() => !document.querySelector("#inline-state-editing").disabled);
    previous = await options.evaluate(async () => chrome.storage.local.get(["inlineStateEditing", "dataConsent", "selectionSummary"]));
    await options.evaluate(async () => chrome.storage.local.set({ inlineStateEditing: true, dataConsent: false, selectionSummary: false }));
    for (const [name, url] of views) {
      for (const item of items.values()) item.state = "New";
      const beforeReads = reads;
      await page.goto(url);
      await page.waitForFunction(() => document.querySelectorAll("[data-azure-niceties-state-trigger]").length === 3);
      assert.equal(reads, beforeReads, `${name}: discovery does not fetch work-item data`);
      assert.equal(await page.locator("#unsaved-row [data-azure-niceties-state-trigger]").count(), 0);
      const menu = page.locator("[data-azure-niceties-state-menu]");
      const writes = patches.length;
      await page.getByRole("button", { name: "Change state of work item 720, currently New", exact: true }).click();
      await menu.getByRole("option", { name: "Active", exact: true }).waitFor();
      assert.equal(patches.length, writes, `${name}: opening makes no write`);
      await menu.getByRole("option", { name: "Active", exact: true }).click();
      await menu.waitFor({ state: "detached" });
      assert.equal(patches.length, writes + 1);
      assert.equal(patches.at(-1), 720, `${name}: explicit choice updates the linked item, not the nested metadata element`);
      await page.getByRole("button", { name: "Change state of work item 721, currently New", exact: true }).click();
      await menu.getByRole("option", { name: "Active", exact: true }).waitFor();
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Change state of work item 725, currently New", exact: true }).click();
      await menu.getByRole("option", { name: "Active", exact: true }).waitFor();
      await page.keyboard.press("Escape");
      await page.locator("#late-list").evaluate(list => { list.style.display = "block"; });
      await page.getByRole("button", { name: "Change state of work item 722, currently New", exact: true }).waitFor();
      await page.getByRole("button", { name: "Change state of work item 722, currently New", exact: true }).click();
      await menu.getByRole("option", { name: "Active", exact: true }).waitFor();
      if (name === "sprint-backlog") await page.screenshot({ path: path.join(os.tmpdir(), "azure-state-list-compatibility.png") });
      await page.keyboard.press("Escape");
      assert.equal(patches.length, writes + 1, `${name}: cancelling other pickers never writes`);
    }
    console.log(JSON.stringify({ stateListCompatibility: "passed", views: views.map(([name]) => name), cases: "split grid headers, nested metadata, hidden editors, field references, style-only panel visibility, explicit saves" }));
  } finally {
    if (previous) await options.evaluate(async previous => {
      await chrome.storage.local.remove(["inlineStateEditing", "dataConsent", "selectionSummary"]);
      await chrome.storage.local.set(previous);
    }, previous).catch(() => {});
    await page.close(); await options.close();
    for (const [, url] of views) await context.unroute(url, fixture);
    await context.unroute(itemPattern, itemRoute); await context.unroute(typePattern, typeRoute);
  }
}
module.exports = { runStateListSmoke };
