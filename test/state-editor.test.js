const test = require("node:test");
const assert = require("node:assert/strict");
const { findTargets, nativeTextNodes } = require("../src/state-editor.js");

const pageUrl = "https://dev.azure.com/example/project/_queries/query/1";
function fixture({ id = "701", cellId = id, state = "New", links, linked = true, explicit = false, card = false, nativeControl = false, editing = false } = {}) {
  const page = require("./state-editor-dom.js").fixture();
  const { document } = page;
  const create = (tag, attributes = {}, text = "") => {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    node.textContent = text;
    return node;
  };
  const scope = document.body.querySelector("table");
  const row = card ? create("article", { class: "wit-card", "data-work-item-id": id }) : page.row;
  const cells = card ? [create("span"), create("span"), create("span", { class: "wit-state" })] : page.cells;
  row.setAttribute(card ? "data-work-item-id" : "data-item-id", id);
  if (card) { scope.remove(); row.append(...cells); document.body.append(row); }
  cells[0].textContent = cellId;
  cells[1].textContent = "Improve search";
  cells[2].textContent = state;
  if (explicit) cells[2].setAttribute("data-field", "System.State");
  const urls = links !== undefined ? links : linked ? [`/example/project/_workitems/edit/${id}`] : [];
  for (const url of urls) cells[1].append(create("a", { href: url }, "Open"));
  if (nativeControl) cells[2].append(create("select"));
  if (editing) cells[1].append(create("input"));
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
  page.scope.children[0].remove();
  page.cells[2].attributes["data-field"] = "System.State";
  assert.deepEqual(findTargets(page.document, "https://dev.azure.com/example/project/_git/repo", () => true), []);
});

test("work-item queries can edit states even when the Title column is not displayed", () => {
  const page = fixture({ linked: false });
  page.scope.children[0].remove();
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
