const test = require("node:test");
const assert = require("node:assert/strict");
const workItem = require("../src/work-item.js");

test("shortens Product Backlog Item to PBI", () => {
  assert.equal(workItem.shortType("Product Backlog Item"), "PBI");
});

test("formats the entire label as one rich-text link", () => {
  const result = workItem.formatWorkItem({
    id: "1234",
    type: "Product Backlog Item",
    title: "  Improve   board copy  ",
    url: "https://dev.azure.com/example/project/_workitems/edit/1234",
  });

  assert.equal(result.label, "PBI 1234: Improve board copy");
  assert.equal(
    result.html,
    '<a href="https://dev.azure.com/example/project/_workitems/edit/1234">PBI 1234: Improve board copy</a>'
  );
  assert.equal(
    result.plainText,
    "PBI 1234: Improve board copy"
  );
});

test("escapes work item content in rich text", () => {
  const result = workItem.formatWorkItem({
    id: "8",
    type: "Bug",
    title: "Fix <copy> & paste",
    url: "https://dev.azure.com/example/_workitems/edit/8?x=1&y=2",
  });

  assert.equal(
    result.html,
    '<a href="https://dev.azure.com/example/_workitems/edit/8?x=1&amp;y=2">Bug 8: Fix &lt;copy&gt; &amp; paste</a>'
  );
});

test("extracts an id from an Azure DevOps work item URL", () => {
  assert.equal(workItem.workItemIdFromUrl("https://dev.azure.com/o/p/_workitems/edit/9876"), "9876");
});

test("copy links retain native work-item URLs ending in one slash", () => {
  const url = "https://dev.azure.com/example/Project%20One/_workitems/edit/701/?view=edit#state";
  assert.equal(workItem.safeWorkItemUrl(url), url);
  assert.equal(workItem.workItemIdFromUrl(url), "701");
  assert.equal(workItem.formatWorkItem({ id: "701", type: "Bug", title: "Sample", url }, { mode: "url" }).plainText, url);
  for (const suffix of ["//", "/extra", "/extra/"]) {
    assert.equal(workItem.safeWorkItemUrl(`https://dev.azure.com/example/project/_workitems/edit/701${suffix}`), "");
  }
});

test("supports Markdown, ID, URL, and branch copy formats", () => {
  const item = {
    id: "2345",
    type: "Product Backlog Item",
    title: "Improve sample workflow",
    url: "https://dev.azure.com/example/project/_workitems/edit/2345",
  };

  assert.equal(
    workItem.formatWorkItem(item, { mode: "markdown" }).plainText,
    "[PBI 2345: Improve sample workflow](https://dev.azure.com/example/project/_workitems/edit/2345)"
  );
  assert.equal(workItem.formatWorkItem(item, { mode: "id" }).plainText, "#2345");
  assert.equal(workItem.formatWorkItem(item, { mode: "url" }).plainText, item.url);
  assert.equal(
    workItem.formatWorkItem(item, { mode: "branch", branchPrefix: "feature" }).plainText,
    "feature/2345-improve-sample-workflow"
  );
});

test("adds separately linked parent context to rich and Markdown copies", () => {
  const child = { id: "1234", type: "Product Backlog Item", title: "Child", url: "https://dev.azure.com/o/p/_workitems/edit/1234" };
  const parent = { id: "900", type: "Feature", title: "Parent", url: "https://dev.azure.com/o/p/_workitems/edit/900" };
  const rich = workItem.formatWorkItem(child, { parent });
  const markdown = workItem.formatWorkItem(child, { mode: "markdown", parent });

  assert.equal(rich.plainText, "Feature 900: Parent › PBI 1234: Child");
  assert.equal(
    rich.html,
    '<a href="https://dev.azure.com/o/p/_workitems/edit/900">Feature 900: Parent</a> &rsaquo; <a href="https://dev.azure.com/o/p/_workitems/edit/1234">PBI 1234: Child</a>'
  );
  assert.equal(
    markdown.plainText,
    "[Feature 900: Parent](https://dev.azure.com/o/p/_workitems/edit/900) › [PBI 1234: Child](https://dev.azure.com/o/p/_workitems/edit/1234)"
  );
});

test("maps modifier keys to deterministic copy modes", () => {
  assert.equal(workItem.modeFromModifiers({}), "rich");
  assert.equal(workItem.modeFromModifiers({ shiftKey: true }), "markdown");
  assert.equal(workItem.modeFromModifiers({ altKey: true }), "id");
  assert.equal(workItem.modeFromModifiers({ metaKey: true }), "url");
  assert.equal(workItem.modeFromModifiers({ shiftKey: true, altKey: true }), "branch");
});

test("sanitizes branch names", () => {
  assert.equal(
    workItem.branchName({ id: "42", title: "Café & API: make it work!" }, "Feature Work"),
    "feature-work/42-cafe-and-api-make-it-work"
  );
});

test("long standard work-item types use readable abbreviations", () => {
  assert.equal(workItem.shortType("User Story"), "US");
  assert.equal(workItem.shortType("Test Case"), "TC");
  assert.equal(workItem.shortType("Bug"), "Bug");
  assert.equal(workItem.shortType("Task"), "Task");
  assert.equal(workItem.shortType("constructor"), "constructor");
});

test("every individual copy variant normalizes newlines, tabs, and Unicode line separators", () => {
  const item = { id: "42", type: "Product\nBacklog Item", title: "Fix\tcopy\r\n across\u0085apps\u2028today", url: "https://dev.azure.com/o/p/_workitems/edit/42" };
  for (const mode of ["rich", "markdown", "id", "url", "branch"]) {
    const result = workItem.formatWorkItem(item, { mode });
    assert.equal(/[\r\n\t\u0085\u2028\u2029]/.test(result.plainText), false, mode);
    assert.doesNotMatch(result.html, /<(?:font|style|p|div|table|br)\b|font-family/i);
  }
});

test("bulk references preserve display order, safe links, and one line per distinct work item", () => {
  const first = { id: "12", type: "Product Backlog Item", title: "First\nitem", url: "https://dev.azure.com/o/p/_workitems/edit/12" };
  const second = { id: "13", type: "User Story", title: "Second\titem", url: "https://dev.azure.com/o/p/_workitems/edit/13" };
  const result = workItem.formatWorkItems([first, second, { ...first, url: first.url + "?x=1" },
    { id: "14", title: "Unsafe", url: "https://example.com/_workitems/edit/14" }]);
  assert.equal(result.count, 2);
  assert.equal(result.plainText, "PBI 12: First item\nUS 13: Second item");
  assert.equal(result.html, `<a href="${first.url}">PBI 12: First item</a><br><a href="${second.url}">US 13: Second item</a>`);
  assert.doesNotMatch(result.html, /font|style=|<p>|<div>|<table>/i);
  assert.equal(workItem.formatWorkItems([]), null);
});
