const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../src/work-item.js");

test("rich copy keeps punctuation literal in text and safely escapes both parent and child HTML", () => {
  const child = { id: "12", type: "Bug", title: `Fix "quotes" & <tags> 'today'`, url: `https://dev.azure.com/o/p/_workitems/edit/12?filter="x"&label='y'` };
  const parent = { id: "1", type: "Feature", title: "<Parent> & roadmap", url: "" };
  const result = core.formatWorkItem(child, { parent });
  assert.equal(result.plainText, `Feature 1: <Parent> & roadmap › Bug 12: Fix "quotes" & <tags> 'today'`);
  assert.equal(result.html, 'Feature 1: &lt;Parent&gt; &amp; roadmap &rsaquo; <a href="https://dev.azure.com/o/p/_workitems/edit/12?filter=%22x%22&amp;label=%27y%27">Bug 12: Fix &quot;quotes&quot; &amp; &lt;tags&gt; &#39;today&#39;</a>');
});

test("Markdown protects literal HTML titles and project parentheses and query backslashes", () => {
  const item = {
    id: "12", type: "Bug", title: '<img src=x onerror="alert(1)"> & *emphasis*',
    url: String.raw`https://dev.azure.com/o/Project(Backlog)/_workitems/edit/12?path=a\b`,
  };
  const result = core.formatWorkItem(item, { mode: "markdown" });
  // HTML-looking work-item text remains literal; it cannot introduce Markdown HTML.
  assert.equal(result.plainText.includes("<img"), false);
  assert.match(result.plainText, /&lt;img src=x onerror="alert\\\(1\\\)"&gt; &amp;/);
  assert.ok(result.plainText.includes(String.raw`\*emphasis\*`));
  assert.ok(result.plainText.endsWith(String.raw`](https://dev.azure.com/o/Project\(Backlog\)/_workitems/edit/12?path=a\\b)`));
});

test("untrusted destinations cannot become rich or Markdown links", () => {
  const urls = [
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "https://example.com/_workitems/edit/12",
    "https://dev.azure.com.attacker.example/o/p/_workitems/edit/12",
    "https://dev.azure.com@attacker.example/o/p/_workitems/edit/12",
    "http://dev.azure.com/o/p/_workitems/edit/12",
  ];
  for (const url of urls) {
    const item = { id: "12", type: "Bug", title: "Unsafe link", url };
    const rich = core.formatWorkItem(item);
    const markdown = core.formatWorkItem(item, { mode: "markdown" });
    assert.equal(rich.html, "Bug 12: Unsafe link", url);
    assert.equal(markdown.plainText, "Bug 12: Unsafe link", url);
    assert.equal(core.formatWorkItem(item, { mode: "url" }).plainText, "", url);
  }
});

test("safe work-item destinations require Azure HTTPS origins and exact numeric item routes", () => {
  const rejected = [
    "https://user:password@dev.azure.com/o/p/_workitems/edit/12",
    "https://user@o.visualstudio.com/p/_workitems/edit/12",
    "https://dev.azure.com:8443/o/p/_workitems/edit/12",
    "https://dev.azure.com/_workitems/edit/12",
    "https://dev.azure.com/_hidden/p/_workitems/edit/12",
    "https://dev.azure.com/%5Fhidden/p/_workitems/edit/12",
    "https://dev.azure.com/o%2Fp/p/_workitems/edit/12",
    "https://dev.azure.com/o/p/_workitems/edit/12/extra",
    "https://dev.azure.com/o/p/_workitems/edit/12suffix",
    "https://dev.azure.com/o/p/_workitems/edit/not-an-id",
    "https://nested.o.visualstudio.com/p/_workitems/edit/12",
    "https://visualstudio.com/p/_workitems/edit/12",
  ];
  for (const url of rejected) assert.equal(core.safeWorkItemUrl(url), "", url);
  const accepted = [
    "https://dev.azure.com/o/Project(Backlog)/_workitems/edit/12?x=1&y=2#discussion",
    "https://org-name.visualstudio.com/Project%20One/_workitems/edit/12?fullScreen=true",
    "https://dev.azure.com/o/_workitems/edit/12",
  ];
  for (const url of accepted) assert.equal(core.safeWorkItemUrl(url), url);
  assert.equal(core.safeWorkItemUrl("https://DEV.AZURE.COM:443/o/p/_workitems/edit/12"), "https://dev.azure.com/o/p/_workitems/edit/12");
});

test("Markdown labels escape literal brackets and backslashes without changing plain work-item data", () => {
  const item = { id: "12", type: "Bug", title: String.raw`[UI] C:\build`, url: "https://dev.azure.com/o/p/_workitems/edit/12?path=a)b" };
  const result = core.formatWorkItem(item, { mode: "markdown" });
  assert.equal(result.plainText, String.raw`[Bug 12: \[UI\] C:\\build](https://dev.azure.com/o/p/_workitems/edit/12?path=a\)b)`);
  assert.equal(item.title, String.raw`[UI] C:\build`);
  assert.equal(result.rich, false);
});

test("work-item IDs stop at route delimiters and reject malformed numeric paths", () => {
  for (const suffix of ["", "/", "?fullScreen=true", "#discussion", "/?x=1#tab"]) {
    assert.equal(core.workItemIdFromUrl(`https://example.visualstudio.com/p/_WORKITEMS/EDIT/90210${suffix}`), "90210");
  }
  for (const value of [null, undefined, "", "https://dev.azure.com/o/p/_workitems/edit/", "https://dev.azure.com/o/p/_workitems/edit/-12", "https://dev.azure.com/o/p/_workitems/edit/12abc", "https://dev.azure.com/o/p/_workitems/edit/12.5"]) {
    assert.equal(core.workItemIdFromUrl(value), "", String(value));
  }
});

test("copy modifiers retain documented precedence when Ctrl or Command is also held", () => {
  const cases = [
    [{ ctrlKey: true }, "url"],
    [{ ctrlKey: true, metaKey: true }, "url"],
    [{ shiftKey: true, ctrlKey: true }, "markdown"],
    [{ altKey: true, metaKey: true }, "id"],
    [{ shiftKey: true, altKey: true, metaKey: true, ctrlKey: true }, "branch"],
    [{ shiftKey: false, altKey: false, metaKey: false, ctrlKey: false }, "rich"],
  ];
  for (const [modifiers, expected] of cases) assert.equal(core.modeFromModifiers(modifiers), expected);
});

test("branch copy handles Unicode, punctuation-only titles, and bounded components", () => {
  assert.equal(core.branchName({ id: "8", title: "Crème brûlée ＡＰＩ ① & ②" }, "Fix/Release"), "fix-release/8-creme-brulee-api-1-and-2");
  assert.equal(core.branchName({ id: "8", title: "💥 — !" }, "🚧"), "feature/8-work-item");
  const result = core.branchName({ id: "8", title: "x".repeat(59) + " / trailing text" }, "p".repeat(29) + " / trailing prefix");
  assert.equal(result, `${"p".repeat(29)}/8-${"x".repeat(59)}`);
});

test("parent context cannot leak into ID, URL, or branch copy modes", () => {
  const item = { id: "12", type: "Bug", title: "Child", url: "https://dev.azure.com/o/p/_workitems/edit/12" };
  const parent = { id: "1", type: "Feature", title: "Parent", url: "https://dev.azure.com/o/p/_workitems/edit/1" };
  for (const mode of ["id", "url", "branch"]) {
    assert.deepEqual(core.formatWorkItem(item, { mode, parent }), core.formatWorkItem(item, { mode }));
  }
});
