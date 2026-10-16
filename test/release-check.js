const { chromium } = require("playwright");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const { runBrowserSmoke } = require("./browser-smoke.js");
const { runClipboardSmoke } = require("./clipboard-smoke.js");
const { runReleaseBoltSmoke } = require("./release-bolt-smoke.js");
const { runReleaseTableSmoke } = require("./release-table-smoke.js");
const { runReleaseListSmoke } = require("./release-list-smoke.js");
const { runStateEditorSmoke } = require("./state-editor-smoke.js");
const { runStateListSmoke } = require("./state-list-smoke.js");
const { runStateFormSmoke } = require("./state-form-smoke.js");
const { saveClipboard, restoreClipboard } = require("./clipboard-state.js");

async function main() {
  const releaseOnly = process.argv.includes("--release-only");
  const root = path.resolve(__dirname, "..");
  const extensionRoot = await fs.realpath(path.resolve(process.env.AZURE_NICETIES_EXTENSION || root));
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), "azure-niceties-release-"));
  const executablePath = process.env.AZURE_NICETIES_CHROME
    || chromium.executablePath();
  const extensionId = crypto.createHash("sha256").update(extensionRoot).digest("hex").slice(0, 32)
    .replace(/[0-9a-f]/g, (digit) => String.fromCharCode(97 + parseInt(digit, 16)));
  let context;
  let originalClipboard;
  const close = async () => {
    if (!context) return;
    try {
      const session = await context.browser().newBrowserCDPSession();
      await session.send("Browser.close");
    } catch (_) {}
    await context.close().catch(() => {});
  };
  const interrupt = () => close().finally(() => process.exit(130));
  const terminate = () => close().finally(() => process.exit(143));
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", terminate);
  try {
    // Playwright uses an owned child-process pipe, avoiding a localhost socket.
    context = await chromium.launchPersistentContext(profile, {
      executablePath, headless: true, viewport: { width: 1280, height: 800 },
      ignoreDefaultArgs: ["--disable-extensions"],
      args: [`--disable-extensions-except=${extensionRoot}`, `--load-extension=${extensionRoot}`],
    });
    console.log(JSON.stringify({ browserVersion: context.browser().version() }));
    const page = context.pages()[0];
    await page.goto(`file://${path.join(root, "test/fixture.html")}`);
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    originalClipboard = await saveClipboard(page);
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/options/options.html`);
    await popup.locator("#data-consent").waitFor({ state: "visible" });
    await popup.waitForFunction(() => !document.querySelector("#data-consent").disabled);
    assert.equal(await popup.getByRole("link", { name: "Privacy policy" }).getAttribute("href"),
      "https://kylestay.github.io/Azure-DevOps-Niceties/privacy.html");
    const assets = path.join(root, "store/assets");
    await fs.mkdir(assets, { recursive: true });
    await popup.emulateMedia({ colorScheme: "light" });
    await popup.screenshot({ path: path.join(assets, "settings-light-1280x800.png") });
    await popup.emulateMedia({ colorScheme: "dark" });
    await popup.screenshot({ path: path.join(assets, "settings-dark-1280x800.png") });
    await popup.close();
    const policy = await context.newPage();
    await policy.goto(`file://${path.join(root, "docs/privacy.html")}`);
    await policy.getByRole("heading", { name: "Azure DevOps Niceties privacy policy", exact: true }).waitFor();
    assert.equal(await policy.getByRole("link", { name: "project's support page" }).getAttribute("href"),
      "https://github.com/KyleStay/Azure-DevOps-Niceties/issues");
    if (process.env.AZURE_NICETIES_PRIVACY_PREVIEW) {
      await policy.screenshot({ path: process.env.AZURE_NICETIES_PRIVACY_PREVIEW, fullPage: true });
    }
    await policy.close();
    // Supply a test URL locally; never commit organization URLs or screenshots.
    const nativeUrl = process.env.AZURE_NICETIES_TEST_URL;
    if (nativeUrl) {
      const native = await context.newPage();
      await native.emulateMedia({ colorScheme: "dark" });
      await native.goto(nativeUrl, { waitUntil: "domcontentloaded" });
      const nativeTheme = async () => native.evaluate(() => new Promise((resolve) => {
        const timer = setTimeout(() => resolve(null), 3000);
        const finish = (id) => { clearTimeout(timer); resolve(id); };
        if (typeof window.require !== "function") { finish(null); return; }
        const loaded = (module) => {
          try { finish(module.getService("IVssThemeService")?.getCurrentTheme()?.id); }
          catch (_) { finish(null); }
        };
        let registered;
        try { registered = window.require("VSS/Platform/Context"); }
        catch (_) {}
        if (typeof registered?.getService === "function") loaded(registered);
        else {
          try { window.require(["VSS/Platform/Context"], loaded, () => finish(null)); }
          catch (_) { finish(null); }
        }
      }));
      const waitForTheme = async (expected) => {
        const deadline = Date.now() + 20000;
        while (Date.now() < deadline) {
          try {
            const current = await nativeTheme();
            if (current && (!expected || current === expected)) return current;
          } catch (error) {
            if (!/Execution context was destroyed|Cannot find context/.test(error.message)) throw error;
          }
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
        const diagnosis = await native.evaluate(() => ({ host: location.hostname,
          platformData: Boolean(document.getElementById("dataProviders")), loader: typeof window.require,
          setting: document.documentElement.getAttribute("data-azure-niceties-theme-sync") }));
        throw new Error(`Native Azure DevOps theme did not reach ${expected}: ${JSON.stringify(diagnosis)}`);
      };
      const nativeOptions = await context.newPage();
      try {
        await nativeOptions.goto(`chrome-extension://${extensionId}/options/options.html`);
        await nativeOptions.waitForFunction(() => !document.querySelector("#sync-system-theme").disabled);
        const setSync = async (enabled) => {
          await nativeOptions.bringToFront();
          await nativeOptions.locator("#sync-system-theme").selectOption(enabled ? "on" : "off");
          await nativeOptions.waitForFunction(async (value) =>
            (await chrome.storage.sync.get({ syncSystemTheme: "auto" })).syncSystemTheme === value, enabled);
          await native.bringToFront();
        };
        assert.equal(await nativeOptions.locator("#sync-system-theme").inputValue(), "auto");
        await waitForTheme("ms.vss-web.vsts-theme-dark");
        await native.emulateMedia({ colorScheme: "light" });
        await waitForTheme("ms.vss-web.vsts-theme");
        await setSync(false);
        await native.emulateMedia({ colorScheme: "dark" });
        await native.waitForTimeout(1200);
        assert.equal(await nativeTheme(), "ms.vss-web.vsts-theme", "live opt-out stops native theme changes");
        await native.reload({ waitUntil: "domcontentloaded" });
        await native.waitForFunction(() => document.documentElement.getAttribute("data-azure-niceties-theme-sync") === "false");
        const baseline = await waitForTheme();
        for (const colorScheme of ["light", "dark"]) {
          await native.emulateMedia({ colorScheme });
          await native.waitForTimeout(1200);
          assert.equal(await nativeTheme(), baseline, "saved opt-out survives reload and system changes");
        }
        await setSync(true);
        await waitForTheme("ms.vss-web.vsts-theme-dark");
        console.log(JSON.stringify({ nativeAzureTheme: "automatic default dark/light, explicit overrides, saved opt-out passed" }));
      } finally {
        await nativeOptions.evaluate(async () => chrome.storage.sync.set({ syncSystemTheme: "auto" })).catch(() => {});
        await nativeOptions.close();
      }
      await native.close();
    }
    await runReleaseBoltSmoke(context.browser(), extensionId);
    await runReleaseTableSmoke(context.browser(), extensionId);
    if (!releaseOnly) await runClipboardSmoke(context.browser(), extensionId);
    if (!releaseOnly) await runStateEditorSmoke(context.browser(), extensionId);
    if (!releaseOnly) await runStateListSmoke(context.browser(), extensionId);
    if (!releaseOnly) await runStateFormSmoke(context.browser(), extensionId);
    await runReleaseListSmoke(context.browser(), extensionId);
    if (!releaseOnly) await runBrowserSmoke(context.browser(), extensionId);
    console.log(JSON.stringify({ browserSmoke: "passed", suite: releaseOnly ? "release-list" : "full", extensionId, assets }));
  } finally {
    try {
      if (originalClipboard && context?.browser()?.isConnected()) {
        const restore = await context.newPage();
        try {
          await restore.goto(`file://${path.join(root, "test/fixture.html")}`);
          await restoreClipboard(restore, originalClipboard);
          console.log(JSON.stringify({ originalClipboardRestored: true }));
        } finally { await restore.close(); }
      }
    } finally {
      await close();
      await fs.rm(profile, { recursive: true, force: true });
      process.removeListener("SIGINT", interrupt);
      process.removeListener("SIGTERM", terminate);
      console.log(JSON.stringify({ disposableProfileRemoved: true, profile }));
    }
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
