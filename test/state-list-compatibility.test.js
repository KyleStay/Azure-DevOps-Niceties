const test = require("node:test");
const assert = require("node:assert/strict");
const { fixture } = require("./state-editor-dom.js");
const trigger = "[data-azure-niceties-state-trigger]";
const views = [
  ["release work items", "_releaseProgress?releaseId=50&_a=workitems"],
  ["sprint backlog", "_sprints/backlog/team/iteration"],
  ["product backlog", "_backlogs/backlog/team/Backlog%20items"],
];
function element(page, tag, attributes = {}, text = "") {
  const node = page.document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  node.textContent = text;
  return node;
}
for (const [view, path] of views) {
  test(`${view}: nested item metadata does not split the work-item row`, async () => {
    const page = fixture({ pageUrl: `https://dev.azure.com/example/project/${path}` });
    page.row.removeAttribute("data-item-id");
    page.cells[0].textContent = "";
    page.cells[1].textContent = "";
    page.cells[1].append(element(page, "a", { class: "work-item-card-title", "data-item-id": "701", href: "/example/project/_workitems/edit/701" }, "Fix search"));
    await page.ready();
    assert.ok(page.cells[2].querySelector(trigger));
    assert.equal(page.requests.length, 0);
  });
  test(`${view}: hidden native editors do not prevent State enhancement`, async () => {
    const page = fixture({ pageUrl: `https://dev.azure.com/example/project/${path}` });
    page.cells[1].append(element(page, "input", { hidden: "", value: "Native editor" }));
    await page.ready();
    assert.ok(page.cells[2].querySelector(trigger));
  });
}
test("split grid headers still describe rows inside a presentation table", async () => {
  const page = fixture();
  const table = page.document.body.querySelector("table");
  const header = table.children[0];
  table.setAttribute("role", "presentation");
  const grid = element(page, "div", { role: "treegrid" });
  page.document.body.append(grid);
  grid.append(header, table);
  await page.ready();
  assert.ok(page.cells[2].querySelector(trigger));
});
test("header sort instructions do not hide the State column", async () => {
  const page = fixture();
  const header = page.document.body.querySelectorAll("th")[2];
  header.textContent = "";
  header.append(element(page, "span", {}, "State"), element(page, "span", {}, "Sort descending"));
  await page.ready();
  assert.ok(page.cells[2].querySelector(trigger));
});
for (const attribute of ["data-field-name", "data-field-reference-name", "data-column-id"]) {
  test(`State field metadata supports ${attribute}`, async () => {
    const page = fixture();
    page.document.body.querySelectorAll("th")[2].textContent = "Workflow";
    page.cells[2].setAttribute(attribute, "System.State");
    await page.ready();
    assert.ok(page.cells[2].querySelector(trigger));
  });
}
test("visible unsaved editors and conflicting work-item identities stay protected", async () => {
  const editing = fixture();
  editing.cells[1].append(element(editing, "input", { value: "Unsaved title" }));
  await editing.ready();
  assert.equal(editing.cells[2].querySelector(trigger), null);
  const ambiguous = fixture();
  ambiguous.cells[1].append(element(ambiguous, "a", { href: "/example/project/_workitems/edit/702" }, "Other item"));
  await ambiguous.ready();
  assert.equal(ambiguous.cells[2].querySelector(trigger), null);
});
test("separate native tables keep their own header order inside a work-item list", async () => {
  const page = fixture();
  const first = page.document.body.querySelector("table");
  const host = element(page, "div", { class: "work-item-list" });
  page.document.body.append(host); host.append(first);
  const second = element(page, "table");
  const heading = element(page, "tr");
  for (const name of ["State", "ID", "Title"]) heading.append(element(page, "th", {}, name));
  const row = element(page, "tr", { "data-item-id": "702" });
  const state = element(page, "td", {}, "New");
  row.append(state, element(page, "td", {}, "702"), element(page, "td", {}, "Separate item"));
  second.append(heading, row); host.append(second);
  await page.ready();
  assert.ok(page.cells[2].querySelector(trigger));
  assert.ok(state.querySelector(trigger));
});
