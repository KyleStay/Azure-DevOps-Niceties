const test = require("node:test");
const assert = require("node:assert/strict");
const { findTargets, nativeTextNodes } = require("../src/state-editor.js");

const pageUrl = "https://dev.azure.com/example/project/_queries/query/1";
function fixture({ id = "701", cellId = id, state = "New", links, linked = true, explicit = false, card = false, nativeControl = false, editing = false } = {}) {
  function element(attributes = {}, text = "") {
    return {
      attributes, childNodes: [{ nodeType: 3, nodeValue: text }],
      get textContent() { return this.childNodes.map(node => node.nodeValue || node.textContent || "").join(""); },
      getAttribute(name) { return this.attributes[name] ?? null; },
      hasAttribute(name) { return Object.hasOwn(this.attributes, name); },
      matches() { return false; },
      querySelector() { return null; },
      querySelectorAll() { return []; },
    };
  }
  const scope = element();
  const row = element(card ? { "data-work-item-id": id } : { "data-item-id": id });
  const headers = ["ID", "Title", "State"].map(text => element({}, text));
  const cells = [element({}, cellId), element({}, "Improve search"), element(explicit ? { "data-field": "System.State" } : {}, state)];
  const anchors = links !== undefined ? links.map(url => element({ href: url }))
    : linked ? [element({ href: `/example/project/_workitems/edit/${id}` })] : [];
  for (const header of headers) header.closest = () => scope;
  for (const cell of [...cells, ...anchors]) cell.closest = selector => selector.startsWith("[role='row']") ? row : null;
  cells[2].matches = selector => selector.includes(".wit-state") && card;
  if (nativeControl) cells[2].querySelectorAll = () => [element()];
  row.closest = selector => selector.startsWith("[role='grid']") ? card ? null : scope : null;
  row.matches = () => card;
  row.querySelector = () => editing ? element() : null;
  row.querySelectorAll = selector => {
    if (selector.startsWith("[role='gridcell']")) return card ? [] : cells;
    if (selector.startsWith("[data-field]")) return explicit || card ? [cells[2]] : [];
    if (selector.startsWith("a[href*=")) return anchors;
    return [];
  };
  scope.querySelectorAll = () => headers;
  const document = { querySelectorAll: () => [row] };
  return { document, row, cells, scope, targets: () => findTargets(document, pageUrl, () => true) };
}

test("state editing discovers linked grid rows using native header field indices", () => {
  const page = fixture();
  const [target] = page.targets();
  assert.equal(target.id, "701");
  assert.equal(target.state, "New");
  assert.equal(target.cell, page.cells[2]);
  assert.equal(target.url, "https://dev.azure.com/example/project/_workitems/edit/701");
});

test("unlinked typed grids and work-item cards can resolve IDs without title matching", () => {
  for (const options of [{ linked: false }, { linked: false, card: true }]) {
    const [target] = fixture(options).targets();
    assert.equal(target.id, "701");
    assert.equal(target.url, "https://dev.azure.com/example/_workitems/edit/701");
  }
});

test("explicit state fields and custom workflow state names are preserved", () => {
  const [target] = fixture({ explicit: true, state: "Customer review" }).targets();
  assert.equal(target.state, "Customer review");
});

test("native state controls, rows being edited, and absent states are left alone", () => {
  for (const options of [{ nativeControl: true }, { editing: true }, { state: "" }]) assert.deepEqual(fixture(options).targets(), []);
});

test("ambiguous, unsafe, cross-organization and inconsistent work-item IDs cannot be edited", () => {
  for (const options of [
    { cellId: "702" }, { id: "not-an-id" }, { id: "0" },
    { links: ["https://dev.azure.com/example/project/_workitems/edit/702"] },
    { links: ["https://dev.azure.com/other/project/_workitems/edit/701"] },
    { links: ["https://dev.azure.com/other/project/_WORKITEMS/EDIT/701"] },
    { links: ["https://evil.test/_workitems/edit/701"] },
    { links: ["https://dev.azure.com/example/project/_workitems/edit/701", "https://dev.azure.com/example/project/_workitems/edit/702"] },
  ]) assert.deepEqual(fixture(options).targets(), []);
  const duplicate = fixture({ links: ["https://dev.azure.com/example/project/_workitems/edit/701", "https://dev.azure.com/example/project/_workitems/edit/701?duplicate=true"] });
  assert.equal(duplicate.targets().length, 1);
});

test("hidden rows, hidden states and editable containers do not receive state controls", () => {
  const page = fixture();
  assert.deepEqual(findTargets(page.document, pageUrl, () => false), []);
  page.cells[2].closest = selector => selector.startsWith("[role='row']") ? page.row : {};
  assert.deepEqual(page.targets(), []);
  const editable = fixture();
  const closest = editable.row.closest;
  editable.row.closest = selector => selector.startsWith("[hidden]") ? {} : closest(selector);
  assert.deepEqual(editable.targets(), []);
});

test("generic numeric list entries outside work-item views need a verified work-item identity", () => {
  const page = fixture({ linked: false });
  page.scope.querySelectorAll = () => [];
  page.cells[2].attributes["data-field"] = "System.State";
  assert.deepEqual(findTargets(page.document, "https://dev.azure.com/example/project/_git/repo", () => true), []);
});

test("work-item queries can edit states even when the Title column is not displayed", () => {
  const page = fixture({ linked: false });
  page.scope.querySelectorAll = () => [];
  page.cells[2].attributes["data-field"] = "System.State";
  assert.equal(page.targets()[0].id, "701");
});

test("numeric build or other non-work-item lists are not mistaken for unlinked work items", () => {
  const page = fixture({ linked: false });
  assert.deepEqual(findTargets(page.document, "https://dev.azure.com/example/project/_build/results?buildId=701", () => true), []);
  assert.equal(findTargets(page.document, pageUrl, () => true).length, 1);
});

test("native state text discovery excludes extension controls and decorative icons", () => {
  const native = { nodeType: 3, nodeValue: "Active" };
  const hidden = { nodeType: 1, matches: () => true, childNodes: [{ nodeType: 3, nodeValue: "Copied / old state" }] };
  const cell = { nodeType: 1, childNodes: [native, hidden] };
  assert.deepEqual(nativeTextNodes(cell), [native]);
});
