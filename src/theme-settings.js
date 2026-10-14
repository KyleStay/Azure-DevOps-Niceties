(function () {
  "use strict";

  // Storage is available in the isolated content-script world. The native
  // theme service lives in the page world, so share only this theme mode.
  const attribute = "data-azure-niceties-theme-sync";
  let loadVersion = 0;
  let preference;
  let retryTimer;
  let retryDelay = 1000;

  function publish(enabled) {
    preference = enabled;
    publishPending();
  }

  function publishPending() {
    // document_start can run before the HTML root is constructed.
    if (preference === undefined || !document.documentElement) return;
    document.documentElement.setAttribute(attribute, String(preference));
    document.dispatchEvent(new Event("azure-niceties:theme-setting"));
  }

  async function restore() {
    const version = ++loadVersion;
    clearTimeout(retryTimer);
    try {
      const stored = await chrome.storage.sync.get({ syncSystemTheme: "auto" });
      if (version !== loadVersion) return;
      retryDelay = 1000;
      publish(typeof stored.syncSystemTheme === "boolean" ? stored.syncSystemTheme : "auto");
    } catch (_) {
      // A transient storage failure must not permanently disable syncing.
      if (version !== loadVersion) return;
      retryTimer = setTimeout(restore, retryDelay);
      retryDelay = Math.min(retryDelay * 2, 30000);
    }
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && Object.hasOwn(changes, "syncSystemTheme")) {
      ++loadVersion;
      clearTimeout(retryTimer);
      retryDelay = 1000;
      const value = changes.syncSystemTheme.newValue;
      publish(typeof value === "boolean" ? value : "auto");
    }
  });
  document.addEventListener("DOMContentLoaded", publishPending);
  document.addEventListener("readystatechange", publishPending);
  restore();
})();
