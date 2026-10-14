(function () {
  "use strict";

  const colorScheme = window.matchMedia("(prefers-color-scheme: dark)");
  const forcedColors = window.matchMedia("(forced-colors: active)");
  const LIGHT_THEME = "ms.vss-web.vsts-theme";
  const DARK_THEME = "ms.vss-web.vsts-theme-dark";
  const LOAD_TIMEOUT_MS = 5000;
  let context;
  let loadingContext = false;
  let contextAttempt = 0;
  let contextTimer;
  let checkTimer;
  let retryDelay = 1000;
  let syncing = false;
  let availableThemes = [];
  const automaticThemes = new WeakMap();

  function themeSyncEnabled() {
    const mode = document.documentElement?.getAttribute("data-azure-niceties-theme-sync");
    return mode === "true" || mode === "auto";
  }

  function nativeSelection(service) {
    const id = service.getCurrentTheme()?.id;
    if (!id) return null;
    let selection = automaticThemes.get(service);
    if (!selection) {
      selection = { enabled: id === LIGHT_THEME, lastTheme: id };
      automaticThemes.set(service, selection);
    } else if (id !== selection.lastTheme) {
      // A change not applied by this extension is a new native selection.
      selection.enabled = id === LIGHT_THEME;
      selection.lastTheme = id;
    }
    return selection;
  }

  function canSync(service) {
    const selection = nativeSelection(service);
    return document.documentElement?.getAttribute("data-azure-niceties-theme-sync") === "true"
      || selection?.enabled === true;
  }

  function active() {
    return themeSyncEnabled() && !document.hidden;
  }

  async function withDeadline(request) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("Theme provider timed out")), LOAD_TIMEOUT_MS);
    });
    try {
      return await Promise.race([request, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  function failed(message, error) {
    retryDelay = Math.min(retryDelay * 2, 30000);
    console.debug(message, error);
  }

  function desiredThemeId() {
    return colorScheme.matches ? DARK_THEME : LIGHT_THEME;
  }

  function findTheme(service, id) {
    return availableThemes.find((theme) => theme.id === id) || service.getTheme(id);
  }

  function preservesContrast(service) {
    return forcedColors.matches || /-hc-(?:dark|light)$/.test(service.getCurrentTheme()?.id || "");
  }

  async function syncTheme() {
    if (!active() || !context || !document.body || syncing) return;
    syncing = true;
    try {
      let service = context.getService("IVssThemeService");
      if (!service) return;
      if (!canSync(service)) return;
      if (preservesContrast(service) || service.getCurrentTheme()?.id === desiredThemeId()) {
        retryDelay = 1000;
        return;
      }

      // Pages initially include only the selected theme. Load the same provider
      // as Azure DevOps's theme picker before asking for the other theme.
      if (!findTheme(service, desiredThemeId())) {
        const data = await withDeadline(context.getService("IVssContributionService")
          .getDataAsync("ms.vss-tfs-web.available-themes-data-provider"));
        if (!Array.isArray(data?.themes)) throw new Error("Invalid theme definitions");
        availableThemes = data.themes.filter((theme) => theme && typeof theme.id === "string"
          && theme.data && typeof theme.data === "object");
        service = context.getService("IVssThemeService");
      }

      if (!active() || !service || !canSync(service) || preservesContrast(service)) return;

      // Read the preference again: the system can change while themes load.
      const id = desiredThemeId();
      const theme = service && findTheme(service, id);
      if (theme && service.getCurrentTheme()?.id !== id) {
        // The native service updates CSS variables and notifies components,
        // including editors, without reloading or saving an account preference.
        service.applyTheme(theme);
        const selection = automaticThemes.get(service);
        if (selection) selection.lastTheme = id;
        retryDelay = 1000;
      } else if (!theme) {
        retryDelay = Math.min(retryDelay * 2, 30000);
      }
    } catch (error) {
      failed("Azure DevOps Niceties could not follow the system theme.", error);
    } finally {
      syncing = false;
    }
  }

  function initialize() {
    if (!active() || context || loadingContext || !document.body
      || !document.getElementById("dataProviders") || typeof window.require !== "function") return;
    loadingContext = true;
    const attempt = ++contextAttempt;
    const loadFailed = (error) => {
      if (attempt !== contextAttempt || !loadingContext) return;
      clearTimeout(contextTimer);
      loadingContext = false;
      ++contextAttempt;
      failed("Azure DevOps Niceties could not load the theme service.", error);
    };
    contextTimer = setTimeout(() => loadFailed(new Error("Theme platform timed out")), LOAD_TIMEOUT_MS);
    try {
      const loaded = (platformContext) => {
        if (attempt !== contextAttempt || !loadingContext) return;
        if (typeof platformContext?.getService !== "function") {
          loadFailed(new Error("Invalid theme platform"));
          return;
        }
        clearTimeout(contextTimer);
        loadingContext = false;
        context = platformContext;
        syncTheme();
      };
      // Current Azure DevOps uses a lightweight synchronous module registry.
      // Older pages use AMD and may need to load the module asynchronously.
      let registeredContext;
      try { registeredContext = window.require("VSS/Platform/Context"); }
      catch (_) { /* An AMD module may not be registered yet. */ }
      if (typeof registeredContext?.getService === "function") loaded(registeredContext);
      else window.require(["VSS/Platform/Context"], loaded, loadFailed);
    } catch (error) {
      loadFailed(error);
    }
  }

  function reconcile() {
    clearTimeout(checkTimer);
    if (!active()) {
      clearTimeout(contextTimer);
      ++contextAttempt;
      loadingContext = false;
      return;
    }
    initialize();
    syncTheme();
    // Native navigation and late script readiness are not always accompanied
    // by DOM events. Recheck visible tabs; only missing definitions are fetched.
    checkTimer = setTimeout(reconcile, retryDelay);
  }

  colorScheme.addEventListener("change", reconcile);
  forcedColors.addEventListener("change", reconcile);
  // Azure DevOps recreates its theme service during single-page navigation.
  document.body?.addEventListener("fpsLoaded", reconcile);
  document.addEventListener("fpsLoaded", reconcile, true);
  document.addEventListener("scriptLoaded", reconcile);
  document.addEventListener("visibilitychange", reconcile);
  document.addEventListener("azure-niceties:theme-setting", reconcile);
  document.addEventListener("load", (event) => {
    if (event.target?.tagName === "SCRIPT") reconcile();
  }, true);
  window.addEventListener("pageshow", reconcile);
  reconcile();
})();
