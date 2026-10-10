const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { chromium } = require("playwright");

async function main() {
  const root = path.resolve(__dirname, "..");
  const manifest = JSON.parse(await fs.readFile(path.join(root, "manifest.json"), "utf8"));
  const release = path.join(root, "release", manifest.version);
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), "azure-publisher-qa-"));
  let context;
  try {
    context = await chromium.launchPersistentContext(profile, {
      executablePath: process.env.AZURE_NICETIES_CHROME || chromium.executablePath(),
      headless: true, viewport: { width: 1280, height: 800 },
    });
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const page = context.pages()[0];
    const errors = [];
    const requests = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("request", request => requests.push(request.url()));
    await page.goto(`file://${path.join(release, "publish.html")}`);
    await page.getByRole("heading", { name: "Start with the upload" }).waitFor();
    await page.waitForFunction(() => [...document.querySelectorAll(".asset-preview img")].every(image => image.complete && image.naturalWidth > 0));
    assert.ok(await page.locator(".asset-preview img").evaluateAll(images => images.every(image => {
      const preview = image.parentElement.getBoundingClientRect();
      const bounds = image.getBoundingClientRect();
      return bounds.width <= preview.width && bounds.height <= preview.height;
    })), "asset previews fit without cropping");
    await page.screenshot({ path: "/tmp/azure-publisher-package.png", fullPage: true });
    const hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
    const [zip] = await Promise.all([
      page.waitForEvent("download"), page.getByRole("button", { name: "Download upload ZIP", exact: true }).click(),
    ]);
    const zipName = `azure-devops-niceties-${manifest.version}.zip`;
    assert.equal(zip.suggestedFilename(), zipName);
    assert.equal(hash(await fs.readFile(await zip.path())), hash(await fs.readFile(path.join(release, zipName))));
    for (const [label, filename] of [
      ["Extension icon", "icon-128.png"], ["Small promotional tile", "promo-440x280.png"],
      ["Light settings screenshot", "settings-light-1280x800.png"], ["Dark settings screenshot", "settings-dark-1280x800.png"],
    ]) {
      const [download] = await Promise.all([
        page.waitForEvent("download"), page.getByRole("button", { name: `Download ${label}`, exact: true }).click(),
      ]);
      assert.equal(download.suggestedFilename(), filename);
      assert.equal(hash(await fs.readFile(await download.path())), hash(await fs.readFile(path.join(root, "store/assets", filename))));
    }
    await page.getByRole("button", { name: "Next: Store listing" }).click();
    await page.getByRole("button", { name: "Copy Name", exact: true }).click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), manifest.name);
    await page.getByRole("button", { name: "Copy Detailed description", exact: true }).click();
    const listing = await fs.readFile(path.join(root, "store/LISTING.md"), "utf8");
    const expectedDescription = listing.split("## Detailed description\n\n```text\n")[1].split("\n```")[0];
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), expectedDescription);
    await page.screenshot({ path: "/tmp/azure-publisher-listing.png" });
    await page.getByRole("button", { name: "Next: Privacy" }).click();
    await page.evaluate(() => {
      window.publisherQaWrite = navigator.clipboard.writeText.bind(navigator.clipboard);
      window.publisherQaCopy = document.execCommand.bind(document);
      navigator.clipboard.writeText = async () => { throw Error("Simulated clipboard permission denial"); };
    });
    await page.getByRole("button", { name: "Copy Privacy policy URL", exact: true }).click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "https://kylestay.github.io/Azure-DevOps-Niceties/privacy.html");
    await page.evaluate(() => { document.execCommand = () => false; });
    await page.getByRole("button", { name: "Copy storage justification", exact: true }).click();
    await page.getByText("Text selected. Press Ctrl+C or Command+C to copy.", { exact: true }).waitFor();
    const selection = await page.locator("#storage").evaluate(field => [field.selectionStart, field.selectionEnd, field.value.length]);
    assert.equal(selection[0], 0);
    assert.equal(selection[1], selection[2]);
    assert.ok(selection[2] > 0);
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "https://kylestay.github.io/Azure-DevOps-Niceties/privacy.html");
    await page.evaluate(() => { navigator.clipboard.writeText = window.publisherQaWrite; document.execCommand = window.publisherQaCopy; });
    await page.getByRole("button", { name: "Next: Reviewer access" }).click();
    const notes = "Test account: reviewer@example.invalid\nProject: sample project";
    await page.locator("#reviewer-notes").fill(notes);
    const instructions = await page.locator("#reviewer-output").inputValue();
    assert.ok(instructions.startsWith(`REVIEWER ACCESS\n${notes}\n\nTEST PROCEDURE\n1.`));
    assert.ok(instructions.includes("8. Repeat basic copy"));
    await page.getByRole("button", { name: "Copy complete reviewer instructions", exact: true }).click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), instructions);
    assert.equal(await page.evaluate(() => localStorage.length), 0);
    await page.getByRole("button", { name: "Next: Submit" }).click();
    for (const checkbox of await page.locator("#checklist input").all()) await checkbox.check();
    await page.getByText("7 of 7 checks complete", { exact: true }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: "dark" });
    for (const step of ["package", "listing", "privacy", "review", "finish"]) {
      await page.locator(`nav button[data-step='${step}']`).click();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${step} fits a mobile viewport`);
    }
    await page.screenshot({ path: "/tmp/azure-publisher-mobile.png", fullPage: true });
    await page.reload();
    assert.equal(await page.locator("#reviewer-notes").inputValue(), "");
    assert.equal(await page.locator("#reviewer-output").inputValue().then(value => value.includes(notes)), false);
    assert.ok(requests.every(url => url.startsWith("file:") || url.startsWith("data:")), "the helper never uploads private notes or makes network requests");
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ publisher: "passed", downloads: "ZIP + 4 PNGs match release bytes", clipboard: "native + fallback passed", mobile: "5 steps fit", privateNotes: "not persisted or transmitted" }));
  } finally {
    if (context) {
      try { await (await context.browser().newBrowserCDPSession()).send("Browser.close"); } catch (_) {}
      await context.close().catch(() => {});
    }
    await fs.rm(profile, { recursive: true, force: true });
    console.log(JSON.stringify({ disposableProfileRemoved: true }));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
