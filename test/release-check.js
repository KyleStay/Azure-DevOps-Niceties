const { chromium } = require("playwright");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const { runBrowserSmoke } = require("./browser-smoke.js");

async function main() {
  const root = path.resolve(__dirname, "..");
  const extensionRoot = await fs.realpath(path.resolve(process.env.AZURE_NICETIES_EXTENSION || root));
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), "azure-niceties-release-"));
  const executablePath = process.env.AZURE_NICETIES_CHROME
    || chromium.executablePath();
  const extensionId = crypto.createHash("sha256").update(extensionRoot).digest("hex").slice(0, 32)
    .replace(/[0-9a-f]/g, (digit) => String.fromCharCode(97 + parseInt(digit, 16)));
  let context;
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
        if (typeof window.require !== "function") { resolve(null); return; }
        window.require(["VSS/Platform/Context"], (module) => {
          resolve(module.getService("IVssThemeService")?.getCurrentTheme()?.id);
        }, () => resolve(null));
      }));
      const waitForTheme = async (expected) => {
        const deadline = Date.now() + 20000;
        while (Date.now() < deadline) {
          if (await nativeTheme() === expected) return;
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
        throw new Error(`Native Azure DevOps theme did not reach ${expected}`);
      };
      await waitForTheme("ms.vss-web.vsts-theme-dark");
      await native.emulateMedia({ colorScheme: "light" });
      await waitForTheme("ms.vss-web.vsts-theme");
      console.log(JSON.stringify({ nativeAzureTheme: "dark/light passed" }));
      await native.close();
    }
    await runBrowserSmoke(context.browser(), extensionId);
    console.log(JSON.stringify({ browserSmoke: "passed", extensionId, assets }));
  } finally {
    await close();
    await fs.rm(profile, { recursive: true, force: true });
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", terminate);
    console.log(JSON.stringify({ disposableProfileRemoved: true, profile }));
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
