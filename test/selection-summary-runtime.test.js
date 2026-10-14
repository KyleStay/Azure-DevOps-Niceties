const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const { fakeTimers } = require("./fake-timers.js");

const source = fs.readFileSync(require.resolve("../src/selection-summary.js"), "utf8");
const flush = () => new Promise((resolve) => setImmediate(resolve));

function fixture(get) {
  const document = new EventTarget();
  document.documentElement = null;
  document.body = null;
  const window = new EventTarget();
  const observed = [];
  let changed;
  let reads = 0;
  document.querySelectorAll = () => { reads++; return []; };
  const timers = fakeTimers();
  vm.runInNewContext(source, { document, window, Intl, navigator: { language: "en-US" },
    setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout,
    AzureNicetiesWorkItem: require("../src/work-item.js"),
    MutationObserver: class {
      observe(target) { assert.ok(target, "observer target must exist"); observed.push(target); }
      disconnect() {}
    }, chrome: { storage: { local: { get: defaults => get(defaults) }, onChanged: { addListener(callback) { changed = callback; } } } },
  });
  return { observed, reads: () => reads, advance: timers.advance,
    ready() {
      document.documentElement = { lang: "en-US" };
      document.body = {};
      document.dispatchEvent(new Event("DOMContentLoaded"));
    },
    revoke() { get = async () => ({ selectionSummary: false }); changed({ selectionSummary: { newValue: false } }, "local"); },
  };
}

test("selection observation begins when the root arrives after preferences", async () => {
  const page = fixture(async () => ({ selectionSummary: true }));
  await flush();
  assert.equal(page.observed.length, 0);
  page.ready();
  await page.advance(100);
  assert.equal(page.observed.length, 1);
  assert.ok(page.reads() > 0);
});

test("DOM readiness never reads work items when selection summaries are disabled", async () => {
  const page = fixture(async () => ({ selectionSummary: false }));
  await flush();
  page.ready();
  await page.advance(100);
  assert.equal(page.observed.length, 0);
  assert.equal(page.reads(), 0);
});

test("selection summaries start with no saved preference and stop after an explicit opt-out", async () => {
  const page = fixture(async defaults => ({ ...defaults }));
  await flush();
  page.ready();
  await page.advance(100);
  assert.ok(page.reads() > 0);
  page.revoke();
  await flush();
  const priorReads = page.reads();
  page.ready();
  await page.advance(100);
  assert.equal(page.reads(), priorReads);
});
