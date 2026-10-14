const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { fakeTimers } = require("./fake-timers.js");

const source = fs.readFileSync(path.join(__dirname, "../src/theme-settings.js"), "utf8");
const flush = () => new Promise((resolve) => setImmediate(resolve));

function fixture(get, { rootReady = true } = {}) {
  let changed;
  const published = [];
  let current;
  let events = 0;
  const document = new EventTarget();
  const root = { setAttribute(name, value) {
    assert.equal(name, "data-azure-niceties-theme-sync");
    current = value;
    published.push(value);
  } };
  document.documentElement = rootReady ? root : null;
  const timers = fakeTimers();
  document.addEventListener("azure-niceties:theme-setting", () => { events++; });
  vm.runInNewContext(source, { Event, document, setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout, chrome: { storage: {
    sync: { get }, onChanged: { addListener(callback) { changed = callback; } },
  } } });
  return { published, current: () => current, events: () => events,
    advance: timers.advance,
    makeRootReady() { document.documentElement = root; document.dispatchEvent(new Event("DOMContentLoaded")); },
    change(value, area = "sync") { changed({ syncSystemTheme: { newValue: value } }, area); } };
}

test("the theme bridge defaults to automatic and preserves explicit overrides", async () => {
  const page = fixture(async (defaults) => defaults);
  await flush();
  assert.deepEqual(page.published, ["auto"]);
  assert.equal(page.events(), 1);
  page.change(true);
  assert.equal(page.current(), "true");
  page.change(false, "local");
  assert.equal(page.current(), "true");
  page.change(undefined);
  assert.equal(page.current(), "auto");
});

test("a stored theme-sync opt-in is preserved", async () => {
  const page = fixture(async () => ({ syncSystemTheme: true }));
  await flush();
  assert.deepEqual(page.published, ["true"]);
});

test("a stored opt-out reaches the page before syncing is allowed", async () => {
  const page = fixture(async () => ({ syncSystemTheme: false }));
  await flush();
  assert.deepEqual(page.published, ["false"]);
});

test("a late startup storage read cannot overwrite a newer opt-out", async () => {
  let finish;
  const page = fixture(() => new Promise((resolve) => { finish = resolve; }));
  page.change(false);
  finish({ syncSystemTheme: true });
  await flush();
  assert.deepEqual(page.published, ["false"]);
});

test("unreadable storage never enables theme syncing", async () => {
  const page = fixture(async () => { throw new Error("Storage unavailable"); });
  await flush();
  assert.deepEqual(page.published, []);
});

test("preserves a preference read before the document root exists", async () => {
  const page = fixture(async () => ({ syncSystemTheme: true }), { rootReady: false });
  await flush();
  page.makeRootReady();
  assert.deepEqual(page.published, ["true"]);
});

test("recovers automatically when the initial storage read fails", async () => {
  let attempts = 0;
  const page = fixture(async () => {
    if (++attempts === 1) throw new Error("Transient storage failure");
    return { syncSystemTheme: true };
  });
  await flush();
  await page.advance(1000);
  assert.deepEqual(page.published, ["true"]);
});

test("a newer opt-out cancels a scheduled storage retry", async () => {
  let attempts = 0;
  const page = fixture(async () => { attempts++; throw new Error("Unavailable"); });
  await flush();
  page.change(false);
  await page.advance(30000);
  assert.equal(attempts, 1);
  assert.deepEqual(page.published, ["false"]);
});

test("an opt-out received before the root exists remains disabled when the DOM becomes ready", async () => {
  const page = fixture(async (defaults) => defaults, { rootReady: false });
  await flush();
  page.change(false);
  page.makeRootReady();
  assert.deepEqual(page.published, ["false"]);
});
