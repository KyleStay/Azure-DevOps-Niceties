const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { fakeTimers } = require("./fake-timers.js");

const source = fs.readFileSync(path.join(__dirname, "../src/theme.js"), "utf8");
const LIGHT = "ms.vss-web.vsts-theme";
const DARK = "ms.vss-web.vsts-theme-dark";
const light = { id: LIGHT, data: { "background-color": "white" } };
const dark = { id: DARK, data: { "background-color": "black" } };
const highContrastDark = { id: "ms.vss-web.vsts-theme-hc-dark", data: { "background-color": "black" } };
const highContrastLight = { id: "ms.vss-web.vsts-theme-hc-light", data: { "background-color": "white" } };
const flush = () => new Promise((resolve) => setImmediate(resolve));

function fixture({ systemDark = false, forcedColors = false, current = light, ready = true, loadThemes, loadModule, syncSystemTheme = true, platformDataReady = true, serviceReady = true, synchronousLoader = false } = {}) {
  const media = new EventTarget();
  media.matches = systemDark;
  const forced = new EventTarget();
  forced.matches = forcedColors;
  const body = new EventTarget();
  const document = new EventTarget();
  document.body = body;
  document.documentElement = { getAttribute: () => syncSystemTheme === null ? null : String(syncSystemTheme) };
  document.getElementById = (id) => id === "dataProviders" && platformDataReady ? {} : null;
  const applied = [];
  const errors = [];
  const providerRequests = [];
  const timers = fakeTimers();
  let service = themeService(current);
  function themeService(initial) {
    return {
      current: initial,
      getCurrentTheme() { return this.current; },
      // Azure DevOps initially registers only the saved theme. The provider
      // returns additional definitions rather than registering them here.
      getTheme(id) { return initial.id === id ? initial : undefined; },
      applyTheme(theme) { this.current = theme; applied.push(theme); },
    };
  }
  const context = {
    getService(name) {
      if (name === "IVssThemeService") return serviceReady ? service : null;
      assert.equal(name, "IVssContributionService");
      return {
        async getDataAsync(id) {
          providerRequests.push(id);
          assert.equal(id, "ms.vss-tfs-web.available-themes-data-provider");
          return loadThemes ? loadThemes() : { themes: [light, dark] };
        },
      };
    },
  };
  const window = new EventTarget();
  window.matchMedia = function (query) {
      if (query === "(prefers-color-scheme: dark)") return media;
      assert.equal(query, "(forced-colors: active)");
      return forced;
  };
  function registerLoader() {
    window.require = (modules, callback, errorCallback) => {
      if (synchronousLoader) {
        assert.equal(modules, "VSS/Platform/Context");
        return context;
      }
      assert.deepEqual(Array.from(modules), ["VSS/Platform/Context"]);
      if (loadModule) return loadModule(callback, errorCallback, context);
      callback(context);
    };
  }
  if (ready) registerLoader();
  vm.runInNewContext(source, { window, document, setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout,
    console: { debug: (...args) => errors.push(args) } });
  return {
    applied, errors, providerRequests,
    advance: timers.advance,
    timerCount: timers.count,
    registerPlatformSilently: registerLoader,
    makePlatformDataReady() { platformDataReady = true; },
    makeThemeServiceReady() { serviceReady = true; },
    navigateSilently(initial) { service = themeService(initial); },
    async setHidden(hidden) {
      document.hidden = hidden;
      document.dispatchEvent(new Event("visibilitychange"));
      await flush();
    },
    current: () => service.current,
    chooseNativeTheme(initial) { service.current = initial; },
    async changeThemeSync(enabled) {
      syncSystemTheme = enabled;
      document.dispatchEvent(new Event("azure-niceties:theme-setting"));
      await flush();
    },
    async changeSystem(matches) {
      media.matches = matches;
      media.dispatchEvent(new Event("change"));
      await flush();
    },
    async changeForcedColors(matches) {
      forced.matches = matches;
      forced.dispatchEvent(new Event("change"));
      await flush();
    },
    async navigate(initial) {
      service = themeService(initial);
      // Azure DevOps dispatches this on body without bubbling.
      body.dispatchEvent(new Event("fpsLoaded"));
      await flush();
    },
    async loadPlatform() {
      registerLoader();
      document.dispatchEvent(new Event("scriptLoaded"));
      await flush();
    },
  };
}

test("uses the complete native dark definition on startup", async () => {
  const page = fixture({ systemDark: true });
  await flush();
  assert.equal(page.current(), dark);
  assert.deepEqual(page.applied, [dark]);
  assert.equal(page.providerRequests.length, 1);
});

test("supports the current native synchronous module loader", async () => {
  const page = fixture({ systemDark: true, synchronousLoader: true });
  await flush();
  assert.equal(page.current(), dark);
  await page.changeSystem(false);
  assert.equal(page.current(), light);
  assert.equal(page.errors.length, 0);
});

test("disabled theme syncing preserves the native theme across system changes and navigation", async () => {
  const page = fixture({ systemDark: true, syncSystemTheme: false });
  await flush();
  await page.changeSystem(false);
  await page.changeSystem(true);
  await page.navigate(light);
  assert.deepEqual(page.applied, []);
  assert.equal(page.providerRequests.length, 0);
  await page.changeThemeSync(true);
  assert.equal(page.current(), dark);
});

test("default-off syncing leaves the user's selected dark theme unchanged on a light system", async () => {
  const page = fixture({ current: dark, systemDark: false, syncSystemTheme: false });
  await flush();
  await page.advance(30000);
  await page.changeSystem(true);
  await page.changeSystem(false);
  assert.equal(page.current(), dark);
  assert.deepEqual(page.applied, []);
  assert.equal(page.providerRequests.length, 0);
  await page.changeThemeSync(true);
  assert.equal(page.current(), light);
});

test("waits for the stored setting before applying any theme", async () => {
  const page = fixture({ systemDark: true, syncSystemTheme: null });
  await flush();
  assert.deepEqual(page.applied, []);
  assert.equal(page.providerRequests.length, 0);
  await page.changeThemeSync(false);
  assert.deepEqual(page.applied, []);
});

test("turning sync off immediately stops theme changes and turning it on uses the current system appearance", async () => {
  const page = fixture({ systemDark: true });
  await flush();
  await page.changeThemeSync(false);
  await page.changeSystem(false);
  assert.equal(page.current(), dark);
  await page.navigate(light);
  await page.changeSystem(true);
  assert.equal(page.current(), light);
  await page.changeThemeSync(true);
  assert.equal(page.current(), dark);
});

test("disabling sync prevents an outstanding theme response from applying", async () => {
  let complete;
  const page = fixture({ systemDark: true, loadThemes: () => new Promise((resolve) => { complete = resolve; }) });
  await flush();
  await page.changeThemeSync(false);
  complete({ themes: [light, dark] });
  await flush();
  assert.equal(page.current(), light);
  assert.deepEqual(page.applied, []);
  await page.changeThemeSync(true);
  assert.equal(page.current(), dark);
});

test("leaves an already matching theme alone and switches both ways without refetching", async () => {
  const page = fixture();
  await flush();
  assert.deepEqual(page.applied, []);
  assert.equal(page.providerRequests.length, 0);
  await page.changeSystem(true);
  await page.changeSystem(false);
  await page.changeSystem(false);
  assert.deepEqual(page.applied, [dark, light]);
  assert.equal(page.providerRequests.length, 1);
});

test("switches from a saved dark theme to system light on startup", async () => {
  const page = fixture({ current: dark });
  await flush();
  assert.equal(page.current(), light);
});

test("waits for the platform loader when it becomes ready after injection", async () => {
  const page = fixture({ systemDark: true, ready: false });
  assert.deepEqual(page.applied, []);
  await page.loadPlatform();
  assert.equal(page.current(), dark);
});

test("finds a late platform loader even when no scriptLoaded event fires", async () => {
  const page = fixture({ systemDark: true, ready: false });
  await flush();
  page.registerPlatformSilently();
  await page.advance(1000);
  assert.equal(page.current(), dark);
});

test("finds platform data inserted after the theme script starts", async () => {
  const page = fixture({ systemDark: true, platformDataReady: false });
  await flush();
  assert.deepEqual(page.applied, []);
  page.makePlatformDataReady();
  await page.advance(1000);
  assert.equal(page.current(), dark);
});

test("retries when the context exists before its theme service is ready", async () => {
  const page = fixture({ systemDark: true, serviceReady: false });
  await flush();
  assert.deepEqual(page.applied, []);
  page.makeThemeServiceReady();
  await page.advance(1000);
  assert.equal(page.current(), dark);
});

test("a malformed platform module can be replaced by a valid retry", async () => {
  let attempts = 0;
  const page = fixture({ systemDark: true, loadModule(callback, _failure, context) {
    callback(++attempts === 1 ? {} : context);
  } });
  await flush();
  await page.advance(3000);
  assert.equal(page.current(), dark);
});

test("recovers from a theme provider failure without another system preference change", async () => {
  let attempts = 0;
  const page = fixture({ systemDark: true, loadThemes: () => {
    if (++attempts === 1) throw new Error("Transient theme failure");
    return { themes: [light, dark] };
  } });
  await flush();
  await page.advance(1000);
  assert.equal(page.current(), dark);
});

test("a hung platform callback times out and a fresh attempt can initialize", async () => {
  let attempts = 0;
  const page = fixture({ systemDark: true, loadModule(callback, _failure, context) {
    if (++attempts > 1) callback(context);
  } });
  await flush();
  await page.advance(6000);
  assert.equal(page.current(), dark);
  assert.equal(attempts, 2);
});

test("a hung theme provider times out and retries without applying a late response", async () => {
  let finishOld;
  let attempts = 0;
  const page = fixture({ systemDark: true, loadThemes: () => {
    if (++attempts === 1) return new Promise((resolve) => { finishOld = resolve; });
    return { themes: [light, dark] };
  } });
  await flush();
  await page.advance(6000);
  assert.equal(page.current(), dark);
  await page.changeThemeSync(false);
  await page.navigate(light);
  finishOld({ themes: [light, dark] });
  await flush();
  assert.equal(page.current(), light);
  assert.deepEqual(page.applied, [dark]);
});

test("detects theme resets during navigation even when fpsLoaded is missed", async () => {
  const page = fixture({ systemDark: true });
  await flush();
  page.navigateSilently(light);
  await page.advance(1000);
  assert.equal(page.applied.length, 2);
});

test("a late callback from a timed-out platform attempt cannot replace the recovered context", async () => {
  let staleCallback;
  let attempts = 0;
  const page = fixture({ systemDark: true, loadModule(callback, _failure, context) {
    if (++attempts === 1) staleCallback = callback;
    else callback(context);
  } });
  await flush();
  await page.advance(6000);
  staleCallback({ getService() { throw new Error("Stale platform must never be used"); } });
  await page.changeSystem(false);
  assert.equal(page.current(), light);
  assert.equal(page.errors.some((args) => String(args[1]).includes("Stale platform")), false);
});

test("disabled syncing stops automatic polling", async () => {
  const page = fixture({ systemDark: true });
  await flush();
  await page.changeThemeSync(false);
  assert.equal(page.timerCount(), 0);
  page.navigateSilently(light);
  await page.advance(30000);
  assert.equal(page.current(), light);
  assert.equal(page.providerRequests.length, 1);
});

test("hidden tabs stop polling and reconcile immediately when visible", async () => {
  const page = fixture({ systemDark: true });
  await flush();
  await page.setHidden(true);
  assert.equal(page.timerCount(), 0);
  page.navigateSilently(light);
  await page.advance(10000);
  assert.equal(page.current(), light);
  await page.setHidden(false);
  assert.equal(page.current(), dark);
});

test("repeated provider failures back off instead of requesting every second", async () => {
  const page = fixture({ systemDark: true, loadThemes: () => { throw new Error("Offline"); } });
  await flush();
  await page.advance(60000);
  assert.ok(page.providerRequests.length < 10, `Requests must back off: ${page.providerRequests.length}`);
  assert.equal(page.current(), light);
});

test("reapplies the system theme to a recreated service after navigation", async () => {
  const page = fixture({ systemDark: true });
  await flush();
  await page.navigate(light);
  assert.equal(page.current(), dark);
  assert.deepEqual(page.applied, [dark, dark]);
  assert.equal(page.providerRequests.length, 1);
});

test("uses the latest system preference when a theme request finishes", async () => {
  let complete;
  const page = fixture({
    systemDark: true,
    loadThemes: () => new Promise((resolve) => { complete = resolve; }),
  });
  await flush();
  await page.changeSystem(false);
  complete({ themes: [light, dark] });
  await flush();
  assert.equal(page.current(), light);
  assert.deepEqual(page.applied, []);
  await page.changeSystem(true);
  assert.equal(page.current(), dark);
  assert.equal(page.providerRequests.length, 1);
});

test("keeps the current theme on a failed load and retries on the next change", async () => {
  let attempts = 0;
  const page = fixture({ systemDark: true, loadThemes: () => {
    if (++attempts === 1) throw new Error("Theme provider unavailable");
    return { themes: [light, dark] };
  } });
  await flush();
  assert.equal(page.current(), light);
  assert.equal(page.errors.length, 1);
  await page.changeSystem(false);
  await page.changeSystem(true);
  assert.equal(page.current(), dark);
  assert.equal(attempts, 2);
});

for (const response of [null, {}, { themes: null }, { themes: {} }, { themes: [null, { id: DARK }] }]) {
  test(`recovers from malformed theme provider data: ${JSON.stringify(response)}`, async () => {
    let attempts = 0;
    const page = fixture({ systemDark: true, loadThemes: () => {
      return ++attempts === 1 ? response : { themes: [light, dark] };
    } });
    await flush();
    assert.equal(page.current(), light);
    assert.deepEqual(page.applied, []);
    await page.changeSystem(false);
    await page.changeSystem(true);
    assert.equal(page.current(), dark);
    assert.equal(attempts, 2);
  });
}

test("coalesces simultaneous requests and applies the resulting theme once", async () => {
  let complete;
  const page = fixture({ systemDark: true, loadThemes: () => new Promise((resolve) => { complete = resolve; }) });
  await flush();
  await page.changeSystem(true);
  await page.changeSystem(true);
  assert.equal(page.providerRequests.length, 1);
  complete({ themes: [light, dark] });
  await flush();
  assert.equal(page.current(), dark);
  assert.deepEqual(page.applied, [dark]);
});

test("applies a pending theme response to the service created by navigation", async () => {
  let complete;
  const page = fixture({ systemDark: true, loadThemes: () => new Promise((resolve) => { complete = resolve; }) });
  await flush();
  await page.navigate(light);
  complete({ themes: [light, dark] });
  await flush();
  assert.equal(page.current(), dark);
  assert.deepEqual(page.applied, [dark]);
  assert.equal(page.providerRequests.length, 1);
});

test("leaves the current theme intact when the desired native theme is absent", async () => {
  const page = fixture({ systemDark: true, loadThemes: () => ({ themes: [light] }) });
  await flush();
  assert.equal(page.current(), light);
  assert.deepEqual(page.applied, []);
  assert.equal(page.errors.length, 0);
});

test("recovers when the platform loader throws synchronously", async () => {
  let attempts = 0;
  const page = fixture({ systemDark: true, loadModule(callback, errorCallback, context) {
    if (++attempts === 1) throw new Error("Platform loader unavailable");
    callback(context);
  } });
  await flush();
  assert.equal(page.current(), light);
  assert.equal(page.errors.length, 1);
  await page.loadPlatform();
  assert.equal(page.current(), dark);
  assert.equal(attempts, 2);
});

test("recovers when the platform loader reports an asynchronous failure", async () => {
  let attempts = 0;
  const page = fixture({ systemDark: true, loadModule(callback, errorCallback, context) {
    if (++attempts === 1) setImmediate(() => errorCallback(new Error("Platform module unavailable")));
    else callback(context);
  } });
  await flush();
  assert.equal(page.current(), light);
  assert.equal(page.errors.length, 1);
  await page.loadPlatform();
  assert.equal(page.current(), dark);
  assert.equal(attempts, 2);
});

test("suspends theme synchronization during forced colors and resumes when disabled", async () => {
  const page = fixture({ systemDark: true, forcedColors: true });
  await flush();
  await page.changeSystem(false);
  await page.changeSystem(true);
  await page.navigate(light);
  assert.equal(page.current(), light);
  assert.deepEqual(page.applied, []);
  assert.equal(page.providerRequests.length, 0);
  await page.changeForcedColors(false);
  assert.equal(page.current(), dark);
  assert.deepEqual(page.applied, [dark]);
});

test("does not apply an outstanding response when forced colors become active", async () => {
  let complete;
  const page = fixture({ systemDark: true, loadThemes: () => new Promise((resolve) => { complete = resolve; }) });
  await flush();
  await page.changeForcedColors(true);
  complete({ themes: [light, dark] });
  await flush();
  assert.equal(page.current(), light);
  assert.deepEqual(page.applied, []);
  await page.changeForcedColors(false);
  assert.equal(page.current(), dark);
  assert.equal(page.providerRequests.length, 1);
});

for (const current of [highContrastDark, highContrastLight]) {
  test(`preserves an explicitly selected high contrast theme: ${current.id}`, async () => {
    const page = fixture({ systemDark: true, current });
    await flush();
    await page.changeSystem(false);
    await page.navigate(current);
    assert.equal(page.current(), current);
    assert.deepEqual(page.applied, []);
    assert.equal(page.providerRequests.length, 0);
  });
}

test("preserves high contrast selected during an outstanding theme request", async () => {
  let complete;
  const page = fixture({ systemDark: true, loadThemes: () => new Promise((resolve) => { complete = resolve; }) });
  await flush();
  await page.navigate(highContrastLight);
  complete({ themes: [light, dark] });
  await flush();
  assert.equal(page.current(), highContrastLight);
  assert.deepEqual(page.applied, []);
});

test("ignores pages without Azure DevOps platform data", async () => {
  const window = new EventTarget();
  window.matchMedia = () => new EventTarget();
  const document = new EventTarget();
  document.body = new EventTarget();
  document.documentElement = { getAttribute: () => "true" };
  document.getElementById = () => null;
  window.require = () => { throw new Error("Should not request platform modules"); };
  const timers = fakeTimers();
  vm.runInNewContext(source, { window, document, setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout });
  document.dispatchEvent(new Event("scriptLoaded"));
  await flush();
});


test("automatic mode follows the default light theme across its own dark/light changes", async () => {
  const page = fixture({ current: light, systemDark: true, syncSystemTheme: "auto" });
  await flush();
  assert.equal(page.current(), dark);
  await page.changeSystem(false);
  assert.equal(page.current(), light);
  await page.changeSystem(true);
  assert.equal(page.current(), dark);
});

test("automatic mode preserves selected dark and contrast themes", async () => {
  for (const current of [dark, highContrastDark, highContrastLight]) {
    const page = fixture({ current, systemDark: false, syncSystemTheme: "auto" });
    await flush();
    await page.advance(5000);
    await page.changeSystem(true);
    await page.changeSystem(false);
    assert.equal(page.current(), current);
    assert.deepEqual(page.applied, []);
    assert.equal(page.providerRequests.length, 0);
  }
});

test("automatic mode rechecks native selections on navigation and preserves manual changes", async () => {
  const page = fixture({ current: light, systemDark: true, syncSystemTheme: "auto" });
  await flush();
  await page.navigate(dark);
  await page.changeSystem(false);
  assert.equal(page.current(), dark);
  await page.navigate(light);
  await page.changeSystem(true);
  assert.equal(page.current(), dark);
  await page.changeSystem(false);
  page.chooseNativeTheme(dark);
  await page.advance(1000);
  assert.equal(page.current(), dark);
  await page.changeThemeSync(true);
  assert.equal(page.current(), light);
});

test("automatic mode discards a pending definition when the user chooses dark", async () => {
  let finish;
  const page = fixture({ current: light, systemDark: true, syncSystemTheme: "auto", loadThemes: () => new Promise(resolve => { finish = resolve; }) });
  await flush();
  page.chooseNativeTheme(dark);
  finish({ themes: [light, dark] });
  await flush();
  assert.deepEqual(page.applied, []);
  assert.equal(page.current(), dark);
});
