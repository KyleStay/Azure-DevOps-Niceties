// Keep the user's supported system clipboard formats in memory during QA.
// Never print or persist these bytes.
async function saveClipboard(page) {
  await page.bringToFront();
  return page.evaluate(async () => Promise.all((await navigator.clipboard.read({ unsanitized: ["text/html"] })).map(async item => {
    const entries = [];
    for (const type of item.types) {
      if (ClipboardItem.supports(type)) entries.push({ type, bytes: [...new Uint8Array(await (await item.getType(type)).arrayBuffer())] });
    }
    return entries;
  })));
}

async function restoreClipboard(page, items) {
  await page.bringToFront();
  await page.evaluate(async items => {
    const restored = items.filter(entries => entries.length).map(entries => new ClipboardItem(Object.fromEntries(
      entries.map(({ type, bytes }) => [type, new Blob([new Uint8Array(bytes)], { type })]))));
    if (restored.length) await navigator.clipboard.write(restored);
    else await navigator.clipboard.writeText("");
  }, items);
}

module.exports = { saveClipboard, restoreClipboard };
