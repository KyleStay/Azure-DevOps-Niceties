const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { fakeTimers } = require("./fake-timers.js");
const source = fs.readFileSync(require.resolve("../src/state-editor.js"), "utf8");
const flush = () => new Promise(resolve => setImmediate(resolve));

function fixture(get) {
  const document = new EventTarget();
  document.documentElement = null;
  document.body = null;
  let reads = 0;
  let closed = 0;
  let changed;
  const observed = [];
  const timers = fakeTimers();
  document.querySelectorAll = () => { reads++; return []; };
  const root = { document, location: { href: "https://dev.azure.com/example/project/_queries/query/1" },
    AzureNicetiesWorkItem: require("../src/work-item.js"),
    AzureNicetiesStateClient: { ...require("../src/state-client.js"), StateClient: class {
      constructor() { this.saving = new Set(); }
      close() { closed++; }
    } },
    fetch() { throw new Error("No network request should run during discovery"); },
    setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout, addEventListener() {},
    MutationObserver: class { observe(target) { assert.ok(target); observed.push(target); } disconnect() {} },
    chrome: { storage: { local: { get: defaults => get(defaults) }, onChanged: { addListener(callback) { changed = callback; } } } },
  };
  vm.runInNewContext(source, root);
  return { observed, reads: () => reads, closed: () => closed, advance: timers.advance,
    ready() { document.documentElement = {}; document.body = {}; document.dispatchEvent(new Event("DOMContentLoaded")); },
    revoke() { get = async () => ({ inlineStateEditing: false }); changed({ inlineStateEditing: { newValue: false } }, "local"); },
  };
}

test("state editing waits for DOM and preferences, then discovers rows without API requests", async () => {
  const page = fixture(async defaults => defaults);
  await flush();
  assert.equal(page.observed.length, 0);
  page.ready();
  await page.advance(100);
  assert.equal(page.observed.length, 1);
  assert.ok(page.reads() > 0);
});

test("saved state-editing opt-outs and unavailable preferences perform no row processing", async () => {
  for (const get of [async () => ({ inlineStateEditing: false }), async () => { throw Error("Storage unavailable"); }]) {
    const page = fixture(get);
    page.ready();
    await flush();
    await page.advance(200);
    assert.equal(page.reads(), 0);
    assert.equal(page.observed.length, 0);
  }
});

test("revoking state editing stops discovery and closes its API client", async () => {
  const page = fixture(async defaults => defaults);
  page.ready();
  await flush();
  await page.advance(100);
  const reads = page.reads();
  page.revoke();
  await flush();
  await page.advance(500);
  assert.equal(page.reads(), reads);
  assert.equal(page.closed(), 1);
});
