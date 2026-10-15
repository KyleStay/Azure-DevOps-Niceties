const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

async function runStateEditorSmoke(browser, extensionId) {
  const context = browser.contexts()[0];
  const page = await context.newPage();
  const options = await context.newPage();
  const url = "https://dev.azure.com/example/project/_queries/query/state-fixture";
  const trigger = "[data-azure-niceties-state-trigger]";
  const popup = "[data-azure-niceties-state-menu]";
  const items = new Map([
    [701, { state: "New", type: "Bug", rev: 4 }], [702, { state: "Queued", type: "Customer Request", rev: 2 }],
    [703, { state: "To Do", type: "Task", rev: 3 }], [704, { state: "Customer review", type: "Customer Request", rev: 6 }],
    [710, { state: "New", type: "Bug", rev: 1 }],
  ]);
  const definitions = {
    Bug: { name: "Bug", states: [{ name: "New", color: "aaaaaa" }, { name: "Active", color: "0078d4" }, { name: "Closed", color: "107c10" }], transitions: { New: [{ to: "Active" }], Active: [{ to: "Closed" }], Closed: [] } },
    "Customer Request": { name: "Customer Request", states: [{ name: "Queued" }, { name: "Customer review" }, { name: "Done" }], transitions: { Queued: [{ to: "Customer review" }], "Customer review": [{ to: "Done" }] } },
    Task: { name: "Task", states: [{ name: "To Do" }, { name: "Done" }], transitions: { "To Do": [{ to: "Done" }] } },
  };
  const payload = id => ({ id, rev: items.get(id).rev, fields: { "System.Id": id, "System.State": items.get(id).state, "System.WorkItemType": items.get(id).type, "System.TeamProject": "project" } });
  const patches = [];
  let reads = 0;
  let deny = false;
  let heldId = null;
  let releaseRead;
  const fixtureRoute = route => route.fulfill({ status: 200, contentType: "text/html", body: fs.readFileSync(path.join(__dirname, "state-editor-fixture.html"), "utf8") });
  const itemPattern = "https://dev.azure.com/example/_apis/wit/workitems/**";
  const typePattern = "https://dev.azure.com/example/project/_apis/wit/workitemtypes/**";
  const itemRoute = async route => {
    const id = Number(new URL(route.request().url()).pathname.split("/").pop());
    if (route.request().method() === "PATCH") {
      const body = route.request().postDataJSON();
      patches.push({ id, body });
      if (deny && id === 702) return route.fulfill({ status: 403, json: { message: "Permission denied" } });
      if (id === 703) return route.fulfill({ status: 400, json: { message: "A required Resolution field is missing" } });
      if (body[0].value !== items.get(id).rev) return route.fulfill({ status: 400, json: { message: "The revision test failed" } });
      items.get(id).state = body[1].value;
      items.get(id).rev++;
    } else {
      reads++;
      if (heldId === id) await new Promise(resolve => { releaseRead = resolve; });
    }
    return route.fulfill({ json: payload(id) }).catch(() => {});
  };
  const typeRoute = route => route.fulfill({ json: definitions[decodeURIComponent(new URL(route.request().url()).pathname.split("/").pop())] });
  let previous;
  try {
    await context.route(url, fixtureRoute);
    await context.route(itemPattern, itemRoute);
    await context.route(typePattern, typeRoute);
    await options.goto(`chrome-extension://${extensionId}/options/options.html`);
    await options.waitForFunction(() => !document.querySelector("#inline-state-editing").disabled);
    previous = await options.evaluate(async () => chrome.storage.local.get(["inlineStateEditing", "dataConsent", "selectionSummary"]));
    await options.locator("#data-consent").uncheck();
    await options.locator("#selection-summary").uncheck();
    await options.locator("#inline-state-editing").check();
    await page.goto(url);
    await page.waitForFunction(() => document.querySelectorAll("[data-azure-niceties-state-trigger]").length === 5);
    assert.equal(reads, 0, "discovering displayed states makes no API requests");
    assert.equal(await page.locator("#native-control, #editing-row, #ambiguous-row, [contenteditable='true']").locator(trigger).count(), 0, "native editors, unsaved edits, ambiguous rows and editable content stay untouched");
    const bug = page.getByRole("button", { name: "Change state of work item 701, currently New", exact: true }).first();
    await bug.evaluate(button => button.click());
    assert.equal(await page.locator(popup).count(), 0, "synthetic gestures cannot open the state editor");
    assert.equal(reads, 0);
    await bug.click();
    await page.getByRole("option", { name: "Active", exact: true }).waitFor();
    assert.equal(await page.getByRole("option", { name: "Closed", exact: true }).count(), 0, "states without a valid workflow transition are excluded");
    assert.equal(patches.length, 0, "opening does not save");
    await page.screenshot({ path: "/private/tmp/azure-inline-state-menu.png" });
    await page.keyboard.press("Escape");
    await page.locator(popup).waitFor({ state: "detached" });
    assert.equal(patches.length, 0, "cancelling does not save");
    await bug.click();
    await page.getByRole("option", { name: "Active", exact: true }).waitFor();
    await page.keyboard.press("ArrowDown");
    assert.equal(patches.length, 0, "keyboard navigation only moves focus");
    await page.keyboard.press("Enter");
    await page.locator(popup).waitFor({ state: "detached" });
    await page.waitForFunction(() => [...document.querySelectorAll("#items tr[data-item-id='701'] td:last-child")].every(cell => cell.textContent.trim() === "Active"));
    assert.equal(patches.length, 1, "one explicit choice sends exactly one save");
    assert.deepEqual(patches[0].body, [{ op: "test", path: "/rev", value: 4 }, { op: "add", path: "/fields/System.State", value: "Active" }]);
    assert.equal(await page.evaluate(() => window.nativeStateRowClicks), 0, "state editing does not activate native row clicks");
    assert.equal(await page.locator("#items .state-circle").evaluate(dot => getComputedStyle(dot).backgroundColor), "rgb(0, 120, 212)");
    await page.getByRole("button", { name: "Change state of work item 701, currently Active", exact: true }).first().click();
    await page.getByRole("option", { name: "Closed", exact: true }).waitFor();
    items.get(701).rev++; // An edit arriving after the picker opened.
    await page.getByRole("option", { name: "Closed", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "This work item changed" }).waitFor();
    assert.equal(items.get(701).state, "Active");
    assert.equal(patches.length, 2, "conflicts are not automatically retried");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Change state of work item 701, currently Active", exact: true }).first().click();
    await page.getByRole("option", { name: "Closed", exact: true }).click();
    await page.locator(popup).waitFor({ state: "detached" });
    assert.equal(items.get(701).state, "Closed", "reopening reads a fresh revision");
    deny = true;
    await page.getByRole("button", { name: "Change state of work item 702, currently Queued", exact: true }).click();
    await page.getByRole("option", { name: "Customer review", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "permission" }).waitFor();
    assert.equal(items.get(702).state, "Queued");
    await page.keyboard.press("Escape");
    deny = false;
    await page.getByRole("button", { name: "Change state of work item 702, currently Queued", exact: true }).click();
    await page.getByRole("option", { name: "Customer review", exact: true }).click();
    await page.locator(popup).waitFor({ state: "detached" });
    assert.equal(items.get(702).state, "Customer review", "unlinked grids and custom types save using authoritative workflow names");
    await page.getByRole("button", { name: "Change state of work item 703, currently To Do", exact: true }).click();
    await page.getByRole("option", { name: "Done", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "required Resolution" }).waitFor();
    assert.equal(items.get(703).state, "To Do");
    assert.equal(await page.getByRole("link", { name: "Open work item", exact: true }).getAttribute("href"), "https://dev.azure.com/example/project/_workitems/edit/703");
    await page.keyboard.press("Escape");
    heldId = 704;
    const writeCount = patches.length;
    await page.getByRole("button", { name: "Change state of work item 704, currently Customer review", exact: true }).click();
    const waitingSince = Date.now();
    while (!releaseRead && Date.now() - waitingSince < 5000) await page.waitForTimeout(20);
    assert.ok(releaseRead, "the held item read started");
    await page.locator(".wit-card[data-work-item-id='704']").evaluate(card => {
      card.dataset.workItemId = "710";
      card.querySelector("a").href = "/example/project/_workitems/edit/710";
      card.querySelector(".wit-state").textContent = "New";
    });
    releaseRead(); heldId = null;
    await page.locator(popup).waitFor({ state: "detached" });
    await page.getByRole("button", { name: "Change state of work item 710, currently New", exact: true }).waitFor();
    assert.equal(patches.length, writeCount, "recycled rows discard the previous item's picker without saving");
    await options.locator("#inline-state-editing").uncheck();
    await page.waitForFunction(() => !document.querySelector("[data-azure-niceties-state-trigger]"));
    assert.equal(await page.locator("#items tr[data-item-id='701'] td:last-child").first().textContent(), "Closed", "turning editing off restores the saved state as native text");
    assert.equal(await page.locator("#native-control select").count(), 1);
    console.log(JSON.stringify({ inlineStateEditing: "passed", surfaces: "table, ARIA grid, legacy grid, card", safety: "trusted selection, revision conflicts, permissions, workflow rules, recycled rows, opt-out" }));
  } finally {
    releaseRead?.();
    if (previous) await options.evaluate(async previous => {
      await chrome.storage.local.remove(["inlineStateEditing", "dataConsent", "selectionSummary"]);
      await chrome.storage.local.set(previous);
    }, previous).catch(() => {});
    await page.close();
    await options.close();
    await context.unroute(url, fixtureRoute);
    await context.unroute(itemPattern, itemRoute);
    await context.unroute(typePattern, typeRoute);
  }
}

module.exports = { runStateEditorSmoke };
