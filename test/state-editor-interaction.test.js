const test = require("node:test");
const assert = require("node:assert/strict");
const { fixture } = require("./state-editor-dom.js");
const trigger = "[data-azure-niceties-state-trigger]";
const popup = "[data-azure-niceties-state-menu]";
const option = "[data-azure-niceties-state-choice='Active']";

test("state-picker interactions load on trusted open, cancel without saving, and save once on explicit choice", async () => {
  const page = fixture();
  await page.ready();
  const button = page.cells[2].querySelector(trigger);
  assert.ok(button);
  assert.equal(page.requests.length, 0);
  assert.equal(page.messages.length, 0);
  assert.equal(page.cells[2].textContent, "New");
  const shortcut = await page.event("keydown", button, { key: "C", code: "KeyC", shiftKey: true, altKey: true });
  assert.equal(shortcut.stopped, undefined, "existing copy shortcuts remain available while the state button is focused");
  await page.event("click", button, { isTrusted: false });
  assert.equal(page.requests.length, 0);
  assert.equal(page.document.querySelectorAll(popup).length, 0);
  await page.event("click", button);
  assert.equal(page.requests.length, 2);
  assert.ok(page.document.querySelectorAll(option)[0]);
  await page.event("keydown", page.document.activeElement, { key: "ArrowDown" });
  assert.equal(page.requests.filter(request => request.options.method === "PATCH").length, 0);
  await page.event("keydown", page.document.activeElement, { key: "Escape" });
  assert.equal(page.document.querySelectorAll(popup).length, 0);
  await page.event("click", button);
  await page.event("click", page.document.querySelectorAll(option)[0]);
  assert.equal(page.requests.filter(request => request.options.method === "PATCH").length, 1);
  assert.equal(page.cells[2].textContent, "Active");
  assert.deepEqual(JSON.parse(JSON.stringify(page.messages)), [{ origin: "https://dev.azure.com", message: { type: "azure-niceties-state-saved", id: "701", rev: 5 } }]);
  assert.equal(page.document.querySelectorAll(popup).length, 0);
  await page.revoke();
  assert.equal(page.cells[2].querySelector(trigger), null);
  assert.equal(page.cells[2].textContent, "Active", "disabling the feature restores the confirmed state as native text");
});

test("a rejected save keeps the original displayed state and exposes an error with a work-item link", async () => {
  const page = fixture({ saveError: "A required Resolution field is missing" });
  await page.ready();
  await page.event("click", page.cells[2].querySelector(trigger));
  await page.event("click", page.document.querySelectorAll(option)[0]);
  assert.equal(page.cells[2].textContent, "New");
  assert.equal(page.messages.length, 0, "a failed save never requests a native refresh");
  const menu = page.document.querySelectorAll(popup)[0];
  assert.match(menu.querySelector("[role='alert']").textContent, /required Resolution/);
  assert.equal(menu.querySelector("a").hidden, false);
  assert.equal(page.requests.filter(request => request.options.method === "PATCH").length, 1);
  await page.scan();
  assert.equal(page.requests.filter(request => request.options.method === "PATCH").length, 1);
  await page.revoke();
});

test("a form-notification failure does not change a confirmed save into an error", async () => {
  const page = fixture({ notificationError: true });
  await page.ready();
  await page.event("click", page.cells[2].querySelector(trigger));
  await page.event("click", page.document.querySelectorAll(option)[0]);
  assert.equal(page.cells[2].textContent, "Active");
  assert.equal(page.document.querySelectorAll(popup).length, 0);
  assert.equal(page.requests.filter(request => request.options.method === "PATCH").length, 1);
});

test("recycling a row while its picker is loading discards the old item and cannot save", async () => {
  const page = fixture({ holdRead: true });
  await page.ready();
  await page.event("click", page.cells[2].querySelector(trigger));
  page.row.setAttribute("data-item-id", "702");
  page.cells[0].textContent = "702";
  page.cells[2].textContent = "New";
  await page.scan();
  page.finishRead();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(page.document.querySelectorAll(popup).length, 0);
  assert.match(page.cells[2].querySelector(trigger).getAttribute("aria-label"), /702/);
  assert.equal(page.requests.filter(request => request.options.method === "PATCH").length, 0);
  await page.revoke();
});

test("turning editing off during a save removes controls and never applies a late acknowledgement", async () => {
  const page = fixture({ holdSave: true });
  await page.ready();
  await page.event("click", page.cells[2].querySelector(trigger));
  await page.event("click", page.document.querySelectorAll(option)[0]);
  assert.equal(page.requests.filter(request => request.options.method === "PATCH").length, 1);
  await page.revoke();
  page.finishSave();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(page.cells[2].textContent, "New");
  assert.equal(page.document.querySelectorAll(popup).length, 0);
  assert.equal(page.cells[2].querySelector(trigger), null);
  assert.equal(page.requests.filter(request => request.options.method === "PATCH").length, 1);
});
