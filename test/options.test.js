const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const core = require("../src/work-item.js");

const source = fs.readFileSync(path.join(__dirname, "../options/options.js"), "utf8");
const flush = () => new Promise((resolve) => setImmediate(resolve));

function fixture(initial, { consent = false, localSaveError = null, syncSaveWait = null } = {}) {
  const stored = { ...initial };
  const localStored = { dataConsent: consent };
  const inputs = {
    "#include-parent": field({ checked: false }),
    "#branch-prefix": field({ value: "" }),
    "#status": { textContent: "" },
    "#data-consent": field({ checked: false, textContent: "" }),
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
  assert.deepEqual(page.stored, { includeParent: true, branchPrefix: "feature-work-api" });
  assert.equal(page.inputs["#branch-prefix"].value, "feature-work-api");
  assert.equal(page.inputs["#status"].textContent, "Saved");
});

test("data consent restores from local storage and changes without altering synchronized preferences", async () => {
  const preferences = { includeParent: true, branchPrefix: "fix" };
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
