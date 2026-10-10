(function () {
  "use strict";

  const colorScheme = window.matchMedia("(prefers-color-scheme: dark)");
  const forcedColors = window.matchMedia("(forced-colors: active)");
  const LIGHT_THEME = "ms.vss-web.vsts-theme";
  const DARK_THEME = "ms.vss-web.vsts-theme-dark";
  let context;
  let loadingContext = false;
  let loadingThemes;
  let availableThemes = [];

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
    if (!context || !document.body) return;
    try {
      let service = context.getService("IVssThemeService");
      if (!service || preservesContrast(service) || service.getCurrentTheme()?.id === desiredThemeId()) return;

      // Pages initially include only the selected theme. Load the same provider
      // as Azure DevOps's theme picker before asking for the other theme.
      if (!findTheme(service, desiredThemeId())) {
        if (!loadingThemes) {
          loadingThemes = context.getService("IVssContributionService")
            .getDataAsync("ms.vss-tfs-web.available-themes-data-provider")
            .then((data) => {
              if (!Array.isArray(data?.themes)) throw new Error("Invalid theme definitions");
              availableThemes = data.themes.filter((theme) => theme && typeof theme.id === "string"
                && theme.data && typeof theme.data === "object");
            });
        }
        try {
          await loadingThemes;
        } finally {
          loadingThemes = null;
        }
        service = context.getService("IVssThemeService");
      }

      if (!service || preservesContrast(service)) return;

      // Read the preference again: the system can change while themes load.
      const id = desiredThemeId();
      const theme = service && findTheme(service, id);
      if (theme && service.getCurrentTheme()?.id !== id) {
        // The native service updates CSS variables and notifies components,
        // including editors, without reloading or saving an account preference.
        service.applyTheme(theme);
      }
    } catch (error) {
      console.debug("Azure DevOps Niceties could not follow the system theme.", error);
    }
  }

  function initialize() {
    if (context || loadingContext || !document.body
      || !document.getElementById("dataProviders") || typeof window.require !== "function") return;
    loadingContext = true;
    const failed = (error) => {
      loadingContext = false;
      console.debug("Azure DevOps Niceties could not load the theme service.", error);
    };
    try {
      window.require(["VSS/Platform/Context"], (platformContext) => {
        loadingContext = false;
        context = platformContext;
        syncTheme();
      }, failed);
    } catch (error) {
      failed(error);
    }
  }

  colorScheme.addEventListener("change", syncTheme);
  forcedColors.addEventListener("change", syncTheme);
  // Azure DevOps recreates its theme service during single-page navigation.
  document.body?.addEventListener("fpsLoaded", syncTheme);
  document.addEventListener("scriptLoaded", initialize);
  initialize();
})();
