(function () {
  "use strict";
  const core = globalThis.AzureNicetiesWorkItem;
  const includeParent = document.querySelector("#include-parent");
  const branchPrefix = document.querySelector("#branch-prefix");
  const status = document.querySelector("#status");
  const dataConsent = document.querySelector("#data-consent");
  const selectionSummary = document.querySelector("#selection-summary");
  const syncSystemTheme = document.querySelector("#sync-system-theme");
  const controls = [includeParent, branchPrefix, dataConsent, selectionSummary, syncSystemTheme];
  let approved = false;
  let summaryEnabled = false;
  let savedSystemTheme = "auto";
  let latestPreferenceSave = 0;
  let saveQueue = Promise.resolve();
  let latestStatus = 0;
  let statusTimer;

  controls.forEach((control) => { control.disabled = true; });

  async function restore() {
    const [values, local] = await Promise.all([
      chrome.storage.sync.get(core.DEFAULT_SETTINGS),
      chrome.storage.local.get({ dataConsent: true, selectionSummary: true }),
    ]);
    includeParent.checked = values.includeParent;
    branchPrefix.value = values.branchPrefix;
    syncSystemTheme.value = values.syncSystemTheme === true ? "on" : values.syncSystemTheme === false ? "off" : "auto";
    savedSystemTheme = syncSystemTheme.value;
    approved = local.dataConsent !== false;
    dataConsent.checked = approved;
    summaryEnabled = local.selectionSummary !== false;
    selectionSummary.checked = summaryEnabled;
    controls.forEach((control) => { control.disabled = false; });
  }

  async function save() {
    const prefix = core.slugify(branchPrefix.value, 30) || core.DEFAULT_SETTINGS.branchPrefix;
    branchPrefix.value = prefix;
    window.clearTimeout(statusTimer);
    status.textContent = "";
    const request = ++latestStatus;
    latestPreferenceSave = request;
    const values = { includeParent: includeParent.checked, branchPrefix: prefix,
      syncSystemTheme: syncSystemTheme.value === "auto" ? "auto" : syncSystemTheme.value === "on" };
    try {
      const write = saveQueue.then(() => chrome.storage.sync.set(values));
      saveQueue = write.catch(() => {});
      await write;
      savedSystemTheme = values.syncSystemTheme === "auto" ? "auto" : values.syncSystemTheme ? "on" : "off";
      if (request !== latestStatus) return;
      status.textContent = "Saved";
      statusTimer = window.setTimeout(() => { status.textContent = ""; }, 1200);
    } catch (error) {
      if (request === latestPreferenceSave) syncSystemTheme.value = savedSystemTheme;
      if (request !== latestStatus) return;
      status.textContent = `Could not save settings: ${error.message}`;
    }
  }

  includeParent.addEventListener("change", save);
  branchPrefix.addEventListener("change", save);
  syncSystemTheme.addEventListener("change", save);
  dataConsent.addEventListener("change", async () => {
    dataConsent.disabled = true;
    window.clearTimeout(statusTimer);
    status.textContent = "";
    const request = ++latestStatus;
    try {
      await chrome.storage.local.set({ dataConsent: dataConsent.checked });
      approved = dataConsent.checked;
      if (request !== latestStatus) return;
      status.textContent = approved ? "Enhanced copying enabled" : "Enhanced copying disabled";
    } catch (error) {
      dataConsent.checked = approved;
      if (request !== latestStatus) return;
      status.textContent = `Could not save settings: ${error.message}`;
    } finally {
      dataConsent.disabled = false;
    }
  });
  selectionSummary.addEventListener("change", async () => {
    selectionSummary.disabled = true;
    window.clearTimeout(statusTimer);
    const request = ++latestStatus;
    status.textContent = "";
    try {
      await chrome.storage.local.set({ selectionSummary: selectionSummary.checked });
      summaryEnabled = selectionSummary.checked;
      if (request === latestStatus) status.textContent = summaryEnabled ? "Selection summary enabled" : "Selection summary disabled";
    } catch (error) {
      selectionSummary.checked = summaryEnabled;
      if (request === latestStatus) status.textContent = `Could not save settings: ${error.message}`;
    } finally {
      selectionSummary.disabled = false;
    }
  });
  restore().catch((error) => { status.textContent = `Could not load settings: ${error.message}`; });
})();
