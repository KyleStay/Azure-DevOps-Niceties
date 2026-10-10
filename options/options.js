(function () {
  "use strict";
  const core = globalThis.AzureNicetiesWorkItem;
  const includeParent = document.querySelector("#include-parent");
  const branchPrefix = document.querySelector("#branch-prefix");
  const status = document.querySelector("#status");
  const dataConsent = document.querySelector("#data-consent");
  const controls = [includeParent, branchPrefix, dataConsent];
  let approved = false;
  let saveQueue = Promise.resolve();
  let latestStatus = 0;
  let statusTimer;

  controls.forEach((control) => { control.disabled = true; });

  async function restore() {
    const [values, local] = await Promise.all([
      chrome.storage.sync.get(core.DEFAULT_SETTINGS),
      chrome.storage.local.get({ dataConsent: false }),
    ]);
    includeParent.checked = values.includeParent;
    branchPrefix.value = values.branchPrefix;
    approved = local.dataConsent === true;
    dataConsent.checked = approved;
    controls.forEach((control) => { control.disabled = false; });
  }

  async function save() {
    const prefix = core.slugify(branchPrefix.value, 30) || core.DEFAULT_SETTINGS.branchPrefix;
    branchPrefix.value = prefix;
    window.clearTimeout(statusTimer);
    status.textContent = "";
    const request = ++latestStatus;
    const values = { includeParent: includeParent.checked, branchPrefix: prefix };
    try {
      const write = saveQueue.then(() => chrome.storage.sync.set(values));
      saveQueue = write.catch(() => {});
      await write;
      if (request !== latestStatus) return;
      status.textContent = "Saved";
      statusTimer = window.setTimeout(() => { status.textContent = ""; }, 1200);
    } catch (error) {
      if (request !== latestStatus) return;
      status.textContent = `Could not save settings: ${error.message}`;
    }
  }

  includeParent.addEventListener("change", save);
  branchPrefix.addEventListener("change", save);
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
  restore().catch((error) => { status.textContent = `Could not load settings: ${error.message}`; });
})();
