const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../src/theme.js"), "utf8");
const LIGHT = "ms.vss-web.vsts-theme";
const DARK = "ms.vss-web.vsts-theme-dark";
const light = { id: LIGHT, data: { "background-color": "white" } };
const dark = { id: DARK, data: { "background-color": "black" } };
const highContrastDark = { id: "ms.vss-web.vsts-theme-hc-dark", data: { "background-color": "black" } };
const highContrastLight = { id: "ms.vss-web.vsts-theme-hc-light", data: { "background-color": "white" } };
const flush = () => new Promise((resolve) => setImmediate(resolve));

function fixture({ systemDark = false, forcedColors = false, current = light, ready = true, loadThemes, loadModule } = {}) {
  const media = new EventTarget();
  media.matches = systemDark;
  const forced = new EventTarget();
  forced.matches = forcedColors;
  const body = new EventTarget();
  const document = new EventTarget();
  document.body = body;
  document.getElementById = (id) => id === "dataProviders" ? {} : null;
  const applied = [];
  const errors = [];
  const providerRequests = [];
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
      if (name === "IVssThemeService") return service;
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
  const window = {
    matchMedia(query) {
      if (query === "(prefers-color-scheme: dark)") return media;
      assert.equal(query, "(forced-colors: active)");
      return forced;
    },
  };
  function registerLoader() {
    window.require = (modules, callback, errorCallback) => {
      assert.deepEqual(Array.from(modules), ["VSS/Platform/Context"]);
      if (loadModule) return loadModule(callback, errorCallback, context);
      callback(context);
    };
  }
  if (ready) registerLoader();
  vm.runInNewContext(source, { window, document, console: { debug: (...args) => errors.push(args) } });
  return {
    applied, errors, providerRequests,
    current: () => service.current,
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
  const window = { matchMedia: () => new EventTarget() };
  const document = new EventTarget();
  document.body = new EventTarget();
  document.getElementById = () => null;
  window.require = () => { throw new Error("Should not request platform modules"); };
  vm.runInNewContext(source, { window, document });
  document.dispatchEvent(new Event("scriptLoaded"));
  await flush();
});
