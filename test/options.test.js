const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const core = require("../src/work-item.js");

const source = fs.readFileSync(path.join(__dirname, "../options/options.js"), "utf8");
const flush = () => new Promise((resolve) => setImmediate(resolve));

function fixture(initial, { consent = false, selectionSummary, localSaveError = null, syncSaveWait = null, syncSaveError = null } = {}) {
  initial = { ...core.DEFAULT_SETTINGS, ...initial };
  const stored = { ...initial };
  const localStored = { dataConsent: consent };
  if (selectionSummary !== undefined) localStored.selectionSummary = selectionSummary;
  const inputs = {
    "#include-parent": field({ checked: false }),
    "#branch-prefix": field({ value: "" }),
    "#status": { textContent: "" },
    "#data-consent": field({ checked: false, textContent: "" }),
    "#selection-summary": field({ checked: false }),
    "#sync-system-theme": field({ value: "auto" }),
  };
  let finishLoad;
  function field(values) {
    const handlers = new Map();
    return { ...values, disabled: false, addEventListener: (name, handler) => handlers.set(name, handler), async change(values) {
      if (this.disabled) return;
      Object.assign(this, values);
      await handlers.get("change")?.();
    } };
  }
  vm.runInNewContext(source, {
    AzureNicetiesWorkItem: core,
    document: { querySelector: (selector) => inputs[selector] || null },
    window: { clearTimeout() {}, setTimeout() { return 1; } },
    chrome: { storage: { local: {
      get: async (defaults) => ({ ...defaults, ...localStored }),
      set: async (values) => {
        if (localSaveError) throw localSaveError;
        Object.assign(localStored, values);
      },
    }, sync: {
      get: () => new Promise((resolve) => { finishLoad = () => resolve({ ...initial }); }),
      set: async (values) => {
        if (syncSaveWait) await syncSaveWait;
        if (syncSaveError) throw syncSaveError;
        Object.assign(stored, values);
      },
    } } },
  });
  return { stored, localStored, inputs, async load() { finishLoad(); await flush(); } };
}

test("editing while settings load cannot replace an existing branch prefix with the default", async () => {
  const page = fixture({ includeParent: false, branchPrefix: "fix" });
  // A real user cannot change disabled fields; the fixture respects that.
  await page.inputs["#include-parent"].change({ checked: true });
  await page.load();
  assert.equal(page.stored.branchPrefix, "fix");
  assert.equal(page.inputs["#branch-prefix"].value, page.stored.branchPrefix);
  assert.equal(page.inputs["#include-parent"].checked, page.stored.includeParent);
});

test("a loaded options edit saves a sanitized prefix with the selected parent setting", async () => {
  const page = fixture({ includeParent: true, branchPrefix: "fix" });
  await page.load();
  await page.inputs["#branch-prefix"].change({ value: "Feature Work / API" });
  assert.deepEqual(page.stored, { includeParent: true, branchPrefix: "feature-work-api", syncSystemTheme: "auto" });
  assert.equal(page.inputs["#branch-prefix"].value, "feature-work-api");
  assert.equal(page.inputs["#status"].textContent, "Saved");
});

test("data consent restores from local storage and changes without altering synchronized preferences", async () => {
  const preferences = { includeParent: true, branchPrefix: "fix", syncSystemTheme: true };
  const page = fixture(preferences, { consent: true });
  await page.load();
  assert.equal(page.inputs["#data-consent"].checked, true);
  await page.inputs["#data-consent"].change({ checked: false });
  assert.deepEqual(page.localStored, { dataConsent: false });
  assert.deepEqual(page.stored, preferences);
});

test("failed consent saves restore the prior consent state and report the failure", async () => {
  const page = fixture({ includeParent: false, branchPrefix: "feature" }, { localSaveError: new Error("Storage unavailable") });
  await page.load();
  await page.inputs["#data-consent"].change({ checked: true });
  assert.equal(page.inputs["#data-consent"].checked, false);
  assert.deepEqual(page.localStored, { dataConsent: false });
  assert.match(page.inputs["#status"].textContent, /Storage unavailable/);
});

test("selection summaries default on independently of copying and only save a local preference", async () => {
  const page = fixture({ includeParent: false, branchPrefix: "fix" });
  await page.load();
  assert.equal(page.inputs["#selection-summary"].checked, true);
  await page.inputs["#selection-summary"].change({ checked: false });
  assert.deepEqual(page.localStored, { dataConsent: false, selectionSummary: false });
  assert.deepEqual(page.stored, { includeParent: false, branchPrefix: "fix", syncSystemTheme: "auto" });
  assert.equal(page.inputs["#status"].textContent, "Selection summary disabled");
  await page.inputs["#selection-summary"].change({ checked: true });
  assert.equal(page.localStored.selectionSummary, true);
});

test("a saved selection-summary opt-out survives restoration", async () => {
  const page = fixture({}, { selectionSummary: false });
  await page.load();
  assert.equal(page.inputs["#selection-summary"].checked, false);
  assert.equal(page.localStored.selectionSummary, false);
});

test("a failed selection-summary save restores the previous switch value", async () => {
  const page = fixture({ includeParent: false, branchPrefix: "feature" }, { localSaveError: new Error("Storage unavailable") });
  await page.load();
  await page.inputs["#selection-summary"].change({ checked: false });
  assert.equal(page.inputs["#selection-summary"].checked, true);
  assert.match(page.inputs["#status"].textContent, /Storage unavailable/);
});

test("system theme syncing defaults to automatic and can be explicitly enabled", async () => {
  const page = fixture({ includeParent: true, branchPrefix: "fix" });
  await page.load();
  assert.equal(page.inputs["#sync-system-theme"].value, "auto");
  await page.inputs["#sync-system-theme"].change({ value: "on" });
  assert.deepEqual(page.stored, { includeParent: true, branchPrefix: "fix", syncSystemTheme: true });
  assert.deepEqual(page.localStored, { dataConsent: false });
});

test("an existing explicit theme-sync opt-in survives restoration", async () => {
  const page = fixture({ syncSystemTheme: true });
  await page.load();
  assert.equal(page.inputs["#sync-system-theme"].value, "on");
  assert.equal(page.stored.syncSystemTheme, true);
});

test("the theme control can return a saved override to Automatic", async () => {
  const page = fixture({ syncSystemTheme: false });
  await page.load();
  await page.inputs["#sync-system-theme"].change({ value: "auto" });
  assert.equal(page.stored.syncSystemTheme, "auto");
  assert.equal(page.inputs["#sync-system-theme"].value, "auto");
});

test("a saved theme-sync opt-out restores in the menu and survives other preference edits", async () => {
  const page = fixture({ includeParent: false, branchPrefix: "fix", syncSystemTheme: false });
  await page.load();
  assert.equal(page.inputs["#sync-system-theme"].value, "off");
  await page.inputs["#include-parent"].change({ checked: true });
  assert.equal(page.stored.syncSystemTheme, false);
});

test("a failed theme-sync save restores the saved switch state", async () => {
  const page = fixture({}, { syncSaveError: new Error("Sync storage unavailable") });
  await page.load();
  await page.inputs["#sync-system-theme"].change({ value: "on" });
  assert.equal(page.inputs["#sync-system-theme"].value, "auto");
  assert.equal(page.stored.syncSystemTheme, "auto");
  assert.match(page.inputs["#status"].textContent, /Sync storage unavailable/);
});

for (const localSaveError of [null, new Error("Storage unavailable")]) {
  test(`an earlier preference save preserves a newer consent ${localSaveError ? "failure" : "success"} status`, async () => {
    let finishSave;
    const syncSaveWait = new Promise((resolve) => { finishSave = resolve; });
    const page = fixture({ includeParent: false, branchPrefix: "feature" }, { localSaveError, syncSaveWait });
    await page.load();
    const pendingSave = page.inputs["#include-parent"].change({ checked: true });
    await flush();
    await page.inputs["#data-consent"].change({ checked: true });
    const consentStatus = page.inputs["#status"].textContent;
    assert.equal(consentStatus, localSaveError ? "Could not save settings: Storage unavailable" : "Enhanced copying enabled");
    finishSave();
    await pendingSave;
    assert.equal(page.inputs["#status"].textContent, consentStatus);
    assert.equal(page.stored.includeParent, true);
    assert.equal(page.inputs["#data-consent"].checked, !localSaveError);
  });
}
