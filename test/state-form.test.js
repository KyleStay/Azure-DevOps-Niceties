const test = require("node:test");
const assert = require("node:assert/strict");
const { createSynchronizer, start } = require("../src/state-form.js");
const { fakeTimers } = require("./fake-timers.js");

function fixture() {
  const timers = fakeTimers();
  let enabled = true;
  const item = { id: 701, rev: 4, dirty: false, active: false };
  const calls = { reads: 0, refreshes: 0 };
  const handlers = new Map();
  let changed;
  const root = {
    document: { hidden: false, documentElement: { getAttribute: () => enabled ? "true" : "false" }, addEventListener() {},
      querySelectorAll: () => [{ getClientRects: () => pageFormVisible ? [{}] : [] }] },
    location: { href: "https://dev.azure.com/example/project/_queries/query/1" },
    setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout,
    addEventListener: (name, handler) => handlers.set(name, handler),
    MutationObserver: class { constructor(callback) { changed = callback; } observe() {} },
  };
  let pageFormVisible = true;
  const service = {
    async hasActiveWorkItem() { calls.reads++; return item.active; },
    async getId() { return item.id; }, async getRevision() { return item.rev; }, async isDirty() { return item.dirty; },
    async refresh() { calls.refreshes++; item.rev = 5; },
    save() { assert.fail("form synchronization must never save"); },
    setFieldValue() { assert.fail("form synchronization must never overwrite a field"); },
  };
  return { root, service, item, calls, timers, handlers, hideForm() { pageFormVisible = false; }, disable() { enabled = false; changed?.(); } };
}

test("saved items are refreshed when their stale, clean native form opens later", async () => {
  const page = fixture();
  const sync = createSynchronizer(page.root, async () => page.service);
  sync.saved("701", 5);
  await sync.check();
  assert.equal(page.calls.refreshes, 0);
  page.item.active = true;
  await sync.check();
  assert.equal(page.calls.refreshes, 1);
  assert.equal(page.item.rev, 5);
  await sync.check();
  assert.equal(page.calls.refreshes, 1, "a fresh form is not repeatedly refreshed");
});

test("dirty forms are preserved until the user resolves their unsaved edits", async () => {
  const page = fixture(); page.item.active = true; page.item.dirty = true;
  const sync = createSynchronizer(page.root, async () => page.service);
  sync.saved("701", 5);
  await sync.check();
  assert.equal(page.calls.refreshes, 0);
  page.item.dirty = false;
  await sync.check();
  assert.equal(page.calls.refreshes, 1);
});

test("forms for another item, current revisions, and unverified dirty flags never refresh", async () => {
  for (const patch of [{ id: 702 }, { rev: 5 }, { rev: 6 }, { dirty: undefined }]) {
    const page = fixture(); Object.assign(page.item, { active: true }, patch);
    const sync = createSynchronizer(page.root, async () => page.service);
    sync.saved("701", 5);
    await sync.check();
    assert.equal(page.calls.refreshes, 0);
    sync.clear();
  }
});

test("an item switch or new unsaved edit during native reads cancels the refresh", async () => {
  for (const mode of ["switch", "dirty"]) {
    const page = fixture(); page.item.active = true;
    let checks = 0;
    if (mode === "switch") page.service.getId = async () => ++checks === 1 ? 701 : 702;
    else page.service.isDirty = async () => ++checks > 1;
    const sync = createSynchronizer(page.root, async () => page.service);
    sync.saved("701", 5);
    await sync.check();
    assert.equal(page.calls.refreshes, 0);
    sync.clear();
  }
});

test("revocation, organization navigation, and timed-out native callbacks cannot refresh later", async () => {
  for (const mode of ["disabled", "navigation", "timeout"]) {
    const page = fixture(); page.item.active = true;
    let finish;
    const sync = createSynchronizer(page.root, () => new Promise(resolve => { finish = resolve; }));
    sync.saved("701", 5);
    const checking = sync.check();
    if (mode === "disabled") { page.disable(); sync.clear(); }
    if (mode === "navigation") page.root.location.href = "https://dev.azure.com/other/project/_queries";
    if (mode === "timeout") await page.timers.advance(5000);
    finish(page.service);
    await checking;
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(page.calls.reads, 0);
    assert.equal(page.calls.refreshes, 0);
    sync.clear();
  }
});

test("failed native refreshes are bounded and never replaced with a form save", async () => {
  const page = fixture(); page.item.active = true;
  page.service.refresh = async () => { page.calls.refreshes++; throw Error("Native refresh failed"); };
  const sync = createSynchronizer(page.root, async () => page.service);
  sync.saved("701", 5);
  for (let i = 0; i < 5; i++) await sync.check();
  assert.equal(page.calls.refreshes, 3);
});

test("a timed-out native refresh is not started again while its first call remains in flight", async () => {
  const page = fixture(); page.item.active = true;
  let finish;
  page.service.refresh = () => { page.calls.refreshes++; return new Promise(resolve => { finish = () => { page.item.rev = 5; resolve(); }; }); };
  const sync = createSynchronizer(page.root, async () => page.service);
  sync.saved("701", 5);
  const first = sync.check();
  await new Promise(resolve => setImmediate(resolve));
  await page.timers.advance(5000);
  await first;
  await sync.check();
  assert.equal(page.calls.refreshes, 1);
  finish(); await new Promise(resolve => setImmediate(resolve));
  await sync.check();
  assert.equal(page.calls.refreshes, 1);
});

test("the bridge validates same-window messages, preferences, and item identity", async () => {
  const page = fixture(); page.item.active = true;
  page.root.require = () => ({ WorkItemFormService: { getService: async () => page.service } });
  const sync = start(page.root);
  const message = page.handlers.get("message");
  const event = { source: page.root, origin: "https://dev.azure.com", data: { type: "azure-niceties-state-saved", id: "701", rev: 5 } };
  for (const change of [{ source: {} }, { origin: "https://evil.test" }, { data: { ...event.data, id: "../701" } }, { data: { ...event.data, rev: 0 } }]) message({ ...event, ...change });
  await sync.check(); assert.equal(page.calls.reads, 0);
  message(event); await sync.check(); assert.equal(page.calls.refreshes, 1);
  page.item.rev = 4;
  message(event); page.disable(); await sync.check(); assert.equal(page.calls.refreshes, 1);
});

test("the native form adapter supports the legacy AMD loader without changing fields", async () => {
  const page = fixture(); page.item.active = true;
  page.root.require = (names, loaded) => {
    if (typeof names === "string") throw Error("AMD module not loaded");
    assert.deepEqual(names, ["TFS/WorkItemTracking/Services"]);
    loaded({ WorkItemFormService: { getService: async () => page.service } });
  };
  const sync = start(page.root);
  sync.saved("701", 5); await sync.check();
  assert.equal(page.calls.refreshes, 1);
});

test("native modules are not loaded while no item form is visible", async () => {
  const page = fixture(); page.hideForm();
  page.root.require = () => assert.fail("list discovery must not load a native form module");
  const sync = start(page.root);
  sync.saved("701", 5); await sync.check();
  assert.equal(page.calls.reads, 0);
  sync.clear();
});
