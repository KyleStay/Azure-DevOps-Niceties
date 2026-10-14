const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

async function runThemeSmoke(browser, extensionId) {
  const context = browser.contexts()[0];
  const base = "https://dev.azure.com/example/_theme-fixture";
  const fixture = fs.readFileSync(path.join(__dirname, "theme-fixture.html"), "utf8");
  const pattern = `${base}**`;
  const route = (request) => request.fulfill({ status: 200, contentType: "text/html", body: fixture });
  await context.route(pattern, route);
  const page = await context.newPage();
  const popup = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const LIGHT = "ms.vss-web.vsts-theme";
  const DARK = "ms.vss-web.vsts-theme-dark";
  const waitTheme = (theme) => page.waitForFunction((id) => document.body.dataset.theme === id, theme, { timeout: 15000 });
  let original;
  try {
    await popup.goto(`chrome-extension://${extensionId}/options/options.html`);
    await popup.waitForFunction(() => !document.querySelector("#sync-system-theme").disabled);
    const toggle = popup.locator("#sync-system-theme");
    original = await toggle.inputValue();
    async function setSync(enabled) {
      await popup.bringToFront();
      await toggle.selectOption(enabled === "auto" ? "auto" : enabled ? "on" : "off");
      await popup.waitForFunction(async (value) =>
        (await chrome.storage.sync.get({ syncSystemTheme: "auto" })).syncSystemTheme === value, enabled);
      await page.bringToFront();
    }
    assert.equal(original, "auto", "fresh installation chooses automatic theme syncing");
    for (const initial of ["dark", "light", "contrast"]) {
      await page.emulateMedia({ colorScheme: initial === "light" ? "dark" : "light" });
      await page.goto(`${base}?initial=${initial}`);
      await page.waitForFunction(() => document.documentElement.getAttribute("data-azure-niceties-theme-sync") === "auto");
      const expected = initial === "contrast" ? "ms.vss-web.vsts-theme-hc-dark" : DARK;
      await waitTheme(expected);
      await page.waitForTimeout(1200);
      if (initial !== "light") {
        assert.deepEqual(await page.evaluate(() => ({ applied: window.themeFixture.applied,
          providers: window.themeFixture.providerRequests })), { applied: [], providers: 0 },
        "automatic mode preserves selected dark and high-contrast themes");
      } else {
        await page.emulateMedia({ colorScheme: "light" });
        await waitTheme(LIGHT);
        await page.emulateMedia({ colorScheme: "dark" });
        await waitTheme(DARK);
      }
    }
    await setSync(false);
    await page.goto(`${base}?initial=light`);
    await page.waitForTimeout(1200);
    assert.deepEqual(await page.evaluate(() => ({ applied: window.themeFixture.applied,
      modules: window.themeFixture.moduleRequests, providers: window.themeFixture.providerRequests })),
    { applied: [], modules: 0, providers: 0 }, "explicit Off suppresses theme integration entirely");
    await setSync(true);
    await page.emulateMedia({ colorScheme: "dark" });
    for (const scenario of ["normal", "synchronous", "delayed", "provider-fail", "module-hang", "provider-hang"]) {
      await page.goto(`${base}?scenario=${scenario}`);
      await page.bringToFront();
      await waitTheme(DARK);
      assert.equal(await page.locator("html").getAttribute("data-azure-niceties-theme-sync"), "true",
        "the isolated storage script publishes the setting to the page-world script");
      assert.equal(await page.locator("body").evaluate((body) => getComputedStyle(body).backgroundColor), "rgb(17, 17, 17)");
      await page.emulateMedia({ colorScheme: "light" });
      await waitTheme(LIGHT);
      await page.emulateMedia({ colorScheme: "dark" });
      await waitTheme(DARK);
      await page.evaluate(() => window.themeFixture.reset("light"));
      await waitTheme(DARK);
      if (scenario === "module-hang") {
        await page.evaluate(() => window.themeFixture.finishModule());
        await page.emulateMedia({ colorScheme: "light" });
        await waitTheme(LIGHT);
        await page.emulateMedia({ colorScheme: "dark" });
        await waitTheme(DARK);
      }
      if (scenario === "provider-hang") {
        await setSync(false);
        await page.evaluate(() => { window.themeFixture.reset("light"); window.themeFixture.finishProvider(); });
        await page.waitForTimeout(1200);
        assert.equal(await page.locator("body").getAttribute("data-theme"), LIGHT);
        await setSync(true);
        await waitTheme(DARK);
      }
      console.log(JSON.stringify({ themeScenario: scenario, result: "passed" }));
    }
    await setSync(false);
    await page.reload();
    await page.waitForTimeout(1200);
    assert.equal(await page.locator("html").getAttribute("data-azure-niceties-theme-sync"), "false");
    assert.equal(await page.locator("body").getAttribute("data-theme"), LIGHT);
    assert.equal(await page.evaluate(() => window.themeFixture.moduleRequests), 0,
      "a saved opt-out prevents native theme-module loading on startup");
    await setSync(true);
    await waitTheme(DARK);
    await page.emulateMedia({ forcedColors: "active" });
    await page.evaluate(() => window.themeFixture.reset("light", true));
    await page.waitForTimeout(1200);
    assert.equal(await page.locator("body").getAttribute("data-theme"), LIGHT);
    await page.emulateMedia({ forcedColors: "none" });
    await waitTheme(DARK);
    await page.evaluate(() => window.themeFixture.reset("contrast", true));
    await page.emulateMedia({ colorScheme: "light" });
    await page.waitForTimeout(1200);
    assert.equal(await page.locator("body").getAttribute("data-theme"), "ms.vss-web.vsts-theme-hc-dark");
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ packagedThemeSmoke: "passed" }));
  } finally {
    if (original !== undefined) {
      await popup.evaluate(async (value) => chrome.storage.sync.set({ syncSystemTheme: value === "auto" ? "auto" : value === "on" }), original).catch(() => {});
    }
    await page.close();
    await popup.close();
    await context.unroute(pattern, route);
  }
}

module.exports = { runThemeSmoke };
