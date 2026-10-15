const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const core = require("../src/work-item.js");
const source = fs.readFileSync(require.resolve("../src/content.js"), "utf8").replace(/\}\)\(\);\s*$/, `globalThis.contentHelpers = {
  titleWithoutWorkItemPrefix, extractWorkItem, isWorkItemCopyControl, fetchParent,
  parentApiUrl, parentCache, activeParentLookups, nativeFallbackControls, reloadConsent, writeClipboard, showConfirmation,
  loadReleaseCategories,
  updateReleaseWidthHosts, setReleaseWidthHosts, releaseLists, updateReleaseColumns,
  copyForTest: workItem => copyWorkItem(workItem, "rich", null, ++latestCopyRequest), enabled: () => enabled
}; })();`);

class FakeElement {
  constructor(attributes = {}, textContent = "") {
    this.attributes = attributes;
    this.textContent = textContent;
    this.dataset = {};
    this.isConnected = true;
    this.links = [];
    this.controls = [];
  }
  getAttribute(name) { return this.attributes[name] || null; }
  setAttribute(name, value) { this.attributes[name] = value; }
  matches(selector) {
    return Boolean((this.form && selector.includes(".work-item-form"))
      || (this.row && selector.includes("[role='row']")));
  }
  querySelectorAll(selector) {
    if (selector === "a[href]") return this.links;
    if (selector.startsWith("a[href*=")) return this.links.filter(link => link.getAttribute("href").includes("/_workitems/edit/"));
    if (selector.includes("button")) return this.controls;
    return [];
  }
  querySelector(selector) {
    if (selector.startsWith("a[href*=")) return this.querySelectorAll(selector)[0] || null;
    if (selector === "input[aria-label='Title field' i]") return this.titleField || null;
    return null;
  }
  closest(selector) {
    if (selector.includes("button")) return this.control ? this : null;
    return this.container || null;
  }
  append() {}
}

function harness({ approved = true, fetch = async () => { throw Error("Unexpected fetch"); }, localGet,
  href = "https://dev.azure.com/example/project/_workitems/edit/12", timeout = 3000 } = {}) {
  const listeners = {};
  const eventHandlers = {};
  const captureHandlers = new WeakMap();
  const clipboard = {};
  let execCopyBehavior = "ok";
  const status = new FakeElement();
  let storageListener;
  const context = {
    AzureNicetiesWorkItem: core, URL, AbortController, Blob, Promise, Map, WeakSet,
    Element: FakeElement, HTMLElement: FakeElement, location: { href }, console: { debug() {}, warn() {} },
    navigator: { clipboard: { writeText: async () => {} } },
    document: {
      body: new FakeElement(), activeElement: null, querySelector: () => status, querySelectorAll: () => [],
      addEventListener(type, handler, options) {
        captureHandlers.set(handler, options === true || options?.capture === true);
        if (!listeners[type]) listeners[type] = handler;
        (eventHandlers[type] ||= []).push(handler);
      },
      removeEventListener(type, handler) {
        eventHandlers[type] = (eventHandlers[type] || []).filter(candidate => candidate !== handler);
      },
      execCommand(command) {
        assert.equal(command, "copy");
        if (execCopyBehavior === "throw") throw Error("Command failed");
        if (execCopyBehavior === "denied") return false;
        const data = {};
        const event = { defaultPrevented: false,
          clipboardData: execCopyBehavior === "missing" ? null : { setData(type, value) { data[type] = value; } },
          preventDefault() { this.defaultPrevented = true; },
          stopImmediatePropagation() { this.immediatePropagationStopped = true; } };
        const ordered = [...(eventHandlers.copy || [])].sort((left, right) =>
          Number(captureHandlers.get(right)) - Number(captureHandlers.get(left)));
        for (const handler of ordered) {
          handler(event);
          if (event.immediatePropagationStopped) break;
        }
        for (const type of Object.keys(clipboard)) delete clipboard[type];
        if (event.defaultPrevented) Object.assign(clipboard, data);
        else clipboard["text/plain"] = "Native selected text";
        return true;
      },
    },
    window: { addEventListener() {}, setTimeout: (fn, ms) => setTimeout(fn, ms === 3000 ? timeout : ms), clearTimeout,
      requestAnimationFrame: fn => fn(), getComputedStyle: () => ({}) }, fetch,
  };
  if (localGet) context.chrome = { storage: { local: { get: localGet }, onChanged: { addListener(fn) { storageListener = fn; } } } };
  else context.azureNicetiesTestSettings = { dataConsent: approved, includeParent: false };
  vm.createContext(context);
  vm.runInContext(source, context);
  return { ...context.contentHelpers, listeners, context, clipboard, eventHandlers,
    setExecCopyBehavior: behavior => { execCopyBehavior = behavior; }, storageChanged: (...args) => storageListener(...args) };
}

function row({ id = "12", url = "https://dev.azure.com/example/project/_workitems/edit/12", title = "PBI 12: Repair", form = false, competitor = false } = {}) {
  const container = new FakeElement(id ? { "data-item-id": id } : {});
  container.row = !form;
  container.form = form;
  container.links = [new FakeElement({ href: url }, title)];
  if (competitor) container.links.push(new FakeElement({ href: "https://dev.azure.com/example/project/_git/repo/pullrequest/12" }, "Pull request"));
  const control = new FakeElement({ "aria-label": "Copy link" });
  control.control = true;
  control.container = container;
  container.controls = [control];
  return { container, control };
}
const child = { id: "12", title: "Child", type: "Bug", url: "https://dev.azure.com/example/project/_workitems/edit/12" };
const api = "https://dev.azure.com/example/_apis/wit/workitems/900";
const response = value => ({ ok: true, async json() { return value; } });

const categoryPayload = { value: [
  { referenceName: "Microsoft.RequirementCategory", workItemTypes: [{ name: "Requirement" }] },
  { referenceName: "Microsoft.BugCategory", workItemTypes: [{ name: "Bug" }] },
] };
const releaseUrl = "https://dev.azure.com/example/project/_releaseProgress?releaseId=50";
const releaseEntry = (page = releaseUrl) => ({ scope: new FakeElement(), page });

function widthHost(parentElement) {
  return { parentElement, dataset: {}, removeAttribute(name) {
    if (name === "data-azure-niceties-release-width") delete this.dataset.azureNicetiesReleaseWidth;
  } };
}

test("release column layout maps native cells rather than decorative row children", () => {
  const h = harness();
  function element(kind, textContent = "") {
    return {
      kind, textContent, dataset: {}, children: [], parentElement: null,
      tagName: "DIV", attributes: {}, isConnected: true,
      getAttribute(name) { return this.attributes[name] || null; },
      setAttribute(name, value) { this.attributes[name] = value; },
      removeAttribute(name) { delete this.attributes[name]; },
      matches(selector) { return selector.includes("data-azure-niceties-release-column") && Boolean(this.dataset.azureNicetiesReleaseColumn); },
      closest(selector) {
        for (let node = this; node; node = node.parentElement) {
          if (selector.includes("[role='row']") && node.kind === "row") return node;
          if (selector.includes("[role='grid']") && node.kind === "grid") return node;
        }
        return null;
      },
      querySelectorAll(selector) {
        const descendants = this.children.flatMap(child => [child, ...child.querySelectorAll("all")]);
        if (selector === "all") return descendants;
        if (selector.includes("[role='columnheader']")) return descendants.filter(child => child.kind === "header");
        if (selector.startsWith("[role='gridcell']")) return descendants.filter(child => child.kind === "cell");
        if (selector.startsWith("[role='row']")) return descendants.filter(child => child.kind === "row");
        return [];
      },
      contains(child) { return this === child || this.children.some(node => node.contains(child)); },
      append(...children) { for (const child of children) { child.parentElement = this; this.children.push(child); } },
      prepend(...children) { for (const child of children) child.parentElement = this; this.children.unshift(...children); },
      cloneNode() { const copy = element(this.kind); copy.dataset = { ...this.dataset }; copy.attributes = { ...this.attributes }; return copy; },
      remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this); },
    };
  }
  h.context.document.createElement = tag => element(tag);
  h.context.document.createElementNS = (_namespace, tag) => element(tag);
  const scope = element("grid");
  scope.parentElement = h.context.document.body;
  const header = element("row");
  const row = element("row");
  const headers = ["Id", "Type", "Title", "State"].map(text => element("header", text));
  const cells = ["701", "Product Backlog Item", "Keep the title visible", "Done"].map(text => element("cell", text));
  const decorations = [element("decoration"), element("decoration")];
  header.append(decorations[0], ...headers);
  row.append(decorations[1], ...cells);
  scope.append(header, row);
  const entry = { scope, all: element("input"), columns: new Map(), copyColumns: new Map() };
  h.updateReleaseColumns(entry, [{ row }]);
  for (const columns of [headers, cells]) {
    assert.deepEqual(columns.map(cell => cell.dataset.azureNicetiesReleaseField), ["id", "type", "title", "state"]);
  }
  assert.ok(decorations.every(node => node.dataset.azureNicetiesReleaseField === undefined));
  assert.equal(row.children[0].dataset.azureNicetiesReleaseColumn, "copy");
  assert.equal(row.children[1].dataset.azureNicetiesReleaseColumn, "select");
});

test("release width follows legacy header and virtual canvases through shrink-wrapped panel groups", () => {
  const h = harness();
  const panel = widthHost(h.context.document.body);
  const group = widthHost(panel);
  const scope = widthHost(group);
  scope.closest = () => panel;
  const header = widthHost(scope);
  const headerCanvas = widthHost(header);
  const viewport = widthHost(scope);
  const canvas = widthHost(viewport);
  const row = widthHost(canvas);
  const entry = { scope, columns: new Map([[headerCanvas, {}], [row, {}]]) };
  h.updateReleaseWidthHosts(entry);
  for (const host of [group, header, viewport, canvas]) assert.equal(host.dataset.azureNicetiesReleaseWidth, "true");
  for (const host of [panel, scope, row, h.context.document.body]) assert.equal(host.dataset.azureNicetiesReleaseWidth, undefined);
  const replacementCanvas = widthHost(viewport);
  row.parentElement = replacementCanvas;
  h.updateReleaseWidthHosts(entry);
  assert.equal(canvas.dataset.azureNicetiesReleaseWidth, undefined, "replaced canvases return to their native width");
  assert.equal(replacementCanvas.dataset.azureNicetiesReleaseWidth, "true");
  h.setReleaseWidthHosts(entry, new Set());
  for (const host of [group, header, viewport, replacementCanvas]) assert.equal(host.dataset.azureNicetiesReleaseWidth, undefined);
});

test("shared release width hosts stay expanded until their last list is removed", () => {
  const h = harness();
  const shared = widthHost(h.context.document.body);
  const left = { scope: {}, widthHosts: new Set() };
  const right = { scope: {}, widthHosts: new Set() };
  h.releaseLists.set(left.scope, left);
  h.releaseLists.set(right.scope, right);
  h.setReleaseWidthHosts(left, new Set([shared]));
  h.setReleaseWidthHosts(right, new Set([shared]));
  h.setReleaseWidthHosts(left, new Set());
  assert.equal(shared.dataset.azureNicetiesReleaseWidth, "true");
  h.setReleaseWidthHosts(right, new Set());
  assert.equal(shared.dataset.azureNicetiesReleaseWidth, undefined);
});

test("release quick-copy categories use a project-scoped same-origin request and signed-in session", async () => {
  for (const page of [releaseUrl, "https://example.visualstudio.com/Project%20One/_release?releaseId=50"]) {
    const h = harness({ href: page, fetch: async (url, options) => {
      const current = new URL(page);
      assert.equal(url, `${current.origin}${current.pathname.split("/_release")[0]}/_apis/wit/workitemtypecategories?api-version=7.1`);
      assert.equal(options.credentials, "include");
      assert.equal(options.redirect, "error");
      assert.ok(options.signal);
      return response(categoryPayload);
    } });
    const entry = releaseEntry(page);
    await h.loadReleaseCategories(entry);
    assert.equal(entry.processState, "ready");
    assert.deepEqual(entry.categories, { backlog: ["Requirement"], bugs: ["Bug"] });
  }
});

test("release category failures disable quick copy without guessing or following redirected responses", async () => {
  for (const result of [
    { ok: false }, { ...response(categoryPayload), redirected: true },
    { ...response(categoryPayload), url: "https://dev.azure.com/other/project/_apis/wit/workitemtypecategories?api-version=7.1" },
    response({ value: [] }),
  ]) {
    const h = harness({ href: releaseUrl, fetch: async () => result });
    const entry = releaseEntry();
    await h.loadReleaseCategories(entry);
    assert.equal(entry.processState, "unavailable");
    assert.equal(entry.categories, null);
  }
});

test("release category lookups stop without consent and never use an organization-wide route", async () => {
  let requests = 0;
  const fetch = async () => { requests++; return response(categoryPayload); };
  const h = harness({ approved: false, href: releaseUrl, fetch });
  await h.loadReleaseCategories(releaseEntry());
  const noProject = "https://dev.azure.com/example/_release?releaseId=50";
  const approved = harness({ href: noProject, fetch });
  const entry = releaseEntry(noProject);
  await approved.loadReleaseCategories(entry);
  assert.equal(entry.processState, "unavailable");
  assert.equal(requests, 0);
});

test("release category responses cannot carry across navigation or revoked copying", async () => {
  for (const change of ["navigation", "revocation"]) {
    let finish;
    const h = harness({ href: releaseUrl, fetch: () => new Promise(resolve => { finish = resolve; }) });
    const entry = releaseEntry();
    const pending = h.loadReleaseCategories(entry);
    if (change === "navigation") h.context.location.href = "https://dev.azure.com/other/project/_release?releaseId=1";
    else {
      h.context.azureNicetiesTestSettings.dataConsent = false;
      await h.reloadConsent();
    }
    finish(response(categoryPayload));
    await pending;
    assert.equal(entry.categories, null);
  }
});

test("release category timeout bounds hung requests and JSON, and cleanup rejects late responses", async () => {
  for (const stage of ["fetch", "json"]) {
    let finish;
    const late = new Promise(resolve => { finish = resolve; });
    const h = harness({ href: releaseUrl, timeout: 20, fetch: async () => stage === "fetch" ? late : { ok: true, json: () => late } });
    const entry = releaseEntry();
    await h.loadReleaseCategories(entry);
    assert.equal(entry.processState, "unavailable");
    assert.equal(entry.processController.signal.aborted, true);
    finish(stage === "fetch" ? response(categoryPayload) : categoryPayload);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(entry.categories, null, "late results cannot re-enable quick copy");
  }
  let finish;
  const h = harness({ href: releaseUrl, fetch: () => new Promise(resolve => { finish = resolve; }) });
  const entry = releaseEntry();
  const pending = h.loadReleaseCategories(entry);
  entry.processController.abort();
  await pending;
  finish(response(categoryPayload));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(entry.categories, null);
});

test("explicit Title columns retain text resembling a work-item display prefix", () => {
  const h = harness();
  const { container } = row({ title: "12" });
  const grid = new FakeElement();
  const headers = ["ID", "Work Item Type", "Title"].map(label => new FakeElement({}, label));
  headers.forEach(header => { header.closest = () => grid; });
  grid.querySelectorAll = () => headers;
  container.closest = () => grid;
  const cells = ["12", "User Story", ""].map(label => new FakeElement({}, label));
  cells.forEach(cell => { cell.closest = () => container; });
  const originalQuery = container.querySelectorAll.bind(container);
  container.querySelectorAll = selector => selector.startsWith("[role='gridcell']") ? cells : originalQuery(selector);
  for (const title of ["US 12 accessibility requirement", "12: Title starts with a number", "Bug 12: Migration notes"]) {
    cells[2].textContent = `  ${title}\n `;
    assert.equal(h.extractWorkItem(container).title, title);
  }
});

test("numeric titles retain their text while explicit work-item prefixes are removed", () => {
  const h = harness();
  for (const title of ["123 invoices fail", "12 invoices fail", "123: invoices fail", "Bug 123: invoices fail"]) {
    assert.equal(h.titleWithoutWorkItemPrefix(title, "12"), title);
  }
  for (const title of ["PBI 12: invoices fail", "Bug #12 invoices fail", "#12 invoices fail", "12: invoices fail", "12 - invoices fail"]) {
    assert.equal(h.titleWithoutWorkItemPrefix(title, "12"), "invoices fail");
  }
});

test("generic mixed-link copy controls retain native behavior", () => {
  const h = harness();
  const good = row();
  assert.equal(h.isWorkItemCopyControl(good.control, good.container), true);
  const mixed = row({ competitor: true });
  assert.equal(h.isWorkItemCopyControl(mixed.control, mixed.container), false);
  mixed.control.attributes["aria-label"] = "Copy work item link";
  assert.equal(h.isWorkItemCopyControl(mixed.control, mixed.container), true);
});

test("form and explicit data IDs cannot combine unrelated titles and URLs", () => {
  const h = harness();
  assert.equal(h.extractWorkItem(row({ form: true, id: "13", url: child.url.replace(/12$/, "13") }).container), null);
  assert.equal(h.extractWorkItem(row({ id: "13" }).container), null);
  assert.equal(h.extractWorkItem(row({ id: "12abc" }).container), null);
  const good = h.extractWorkItem(row().container);
  assert.equal(good.id, "12");
  assert.equal(good.title, "Repair");
});

test("unsafe or noncanonical work-item links are never extracted", () => {
  const h = harness();
  for (const url of ["http://dev.azure.com/example/_workitems/edit/12", "https://dev.azure.com.evil.test/example/_workitems/edit/12", "https://dev.azure.com/example/_workitems/edit/12/extra", "https://u:p@dev.azure.com/example/_workitems/edit/12", "https://dev.azure.com/example/_workitems/edit/12abc"]) {
    assert.equal(h.extractWorkItem(row({ url }).container), null, url);
  }
});

test("synthetic copy clicks and shortcuts cannot inspect work-item metadata", () => {
  const h = harness();
  const { container, control } = row();
  container.querySelectorAll = () => { throw Error("Metadata inspected"); };
  h.listeners.click({ target: control, isTrusted: false });
  h.listeners.keydown({ target: control, isTrusted: false, shiftKey: true, altKey: true, code: "KeyC" });
  h.listeners.pointerover({ get target() { throw Error("Target inspected"); }, isTrusted: false });
  h.nativeFallbackControls.add(control);
  h.listeners.click({ target: control, isTrusted: false });
  assert.equal(h.nativeFallbackControls.has(control), false);
});

test("work-item processing waits for the local preference and turns off on revoke", async () => {
  let resolveConsent;
  let approved = true;
  const h = harness({ localGet: () => new Promise(resolve => { resolveConsent = () => resolve({ dataConsent: approved }); }) });
  const { container, control } = row();
  container.querySelectorAll = () => { throw Error("Metadata inspected without consent"); };
  h.listeners.click({ target: control, isTrusted: true });
  h.listeners.pointerover({ get target() { throw Error("Pointer target inspected without consent"); }, isTrusted: true });
  assert.equal(h.enabled(), false);
  resolveConsent();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.enabled(), true);
  approved = false;
  h.storageChanged({ dataConsent: { newValue: false } }, "local");
  assert.equal(h.enabled(), false);
  resolveConsent();
  await Promise.resolve();
  assert.equal(h.enabled(), false);
});

test("enhanced copying starts on with no saved preference, preserves off, and fails closed on storage errors", async () => {
  const fresh = harness({ localGet: async defaults => ({ ...defaults }) });
  const optedOut = harness({ localGet: async defaults => ({ ...defaults, dataConsent: false }) });
  const failed = harness({ localGet: async () => { throw Error("Storage unavailable"); } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(fresh.enabled(), true);
  assert.equal(optedOut.enabled(), false);
  assert.equal(failed.enabled(), false);
});

for (const stage of ["child-fetch", "child-json", "parent-fetch", "parent-json"]) {
  test(`revocation cancels parent copying during ${stage} and discards late responses after reapproval`, async () => {
    let release;
    let reached;
    const held = new Promise(resolve => { release = resolve; });
    const pending = new Promise(resolve => { reached = resolve; });
    const childData = { id: 12, relations: [{ rel: "System.LinkTypes.Hierarchy-Reverse", url: api }] };
    const parentData = { id: 900, fields: { "System.Title": "Parent" } };
    const signals = [];
    let blocked = false;
    const h = harness({ fetch: async (url, options) => {
      signals.push(options.signal);
      const phase = new URL(url).pathname.endsWith("/12") ? "child" : "parent";
      const data = phase === "child" ? childData : parentData;
      if (!blocked && stage === `${phase}-fetch`) {
        blocked = true;
        reached();
        return held;
      }
      return { ok: true, json: () => {
        if (!blocked && stage === `${phase}-json`) {
          blocked = true;
          reached();
          return held;
        }
        return Promise.resolve(data);
      } };
    } });
    h.context.azureNicetiesTestSettings.includeParent = true;
    let settled = false;
    const copy = h.copyForTest(child).then(() => { settled = true; });
    await pending;
    h.context.azureNicetiesTestSettings.dataConsent = false;
    await h.reloadConsent();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(signals[0].aborted, true);
    assert.equal(settled, true, "revocation settles copying without waiting for the response or deadline");
    assert.equal(h.activeParentLookups.size, 0);
    assert.equal(h.parentCache.size, 0);
    assert.deepEqual(h.clipboard, {});
    const callsBeforeLateResponse = signals.length;
    h.context.azureNicetiesTestSettings.dataConsent = true;
    await h.reloadConsent();
    const lateData = stage.startsWith("child") ? childData : parentData;
    release(stage.endsWith("fetch") ? response(lateData) : lateData);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(signals.length, callsBeforeLateResponse, "an obsolete response cannot launch another request");
    assert.equal(h.parentCache.size, 0, "an obsolete response cannot cache parent details");
    assert.deepEqual(h.clipboard, {});
    await copy;
    const fresh = await h.fetchParent(child);
    assert.equal(fresh.title, "Parent", "a new approval permits a fresh lookup");
    assert.equal(h.parentCache.size, 1);
    h.context.azureNicetiesTestSettings.dataConsent = false;
    await h.reloadConsent();
    assert.equal(h.parentCache.size, 0, "revocation clears previously cached details too");
    assert.equal(await h.fetchParent(child), null);
    assert.equal(signals.length, callsBeforeLateResponse + 2, "disabled copying never starts a lookup");
  });
}

test("a timed-out child response cannot resume its parent lookup", async () => {
  let release;
  let calls = 0;
  const h = harness({ timeout: 20, fetch: async () => {
    calls++;
    if (calls === 1) return new Promise(resolve => { release = resolve; });
    return response({ id: 900, fields: { "System.Title": "Parent" } });
  } });
  assert.equal(await h.fetchParent(child), null);
  assert.equal(h.activeParentLookups.size, 0);
  release(response({ relations: [{ rel: "System.LinkTypes.Hierarchy-Reverse", url: api }] }));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 1);
  assert.equal(h.parentCache.size, 0);
});

test("parent requests stay in the page organization and reject hostile relation routes", async () => {
  for (const relationUrl of ["https://evil.test/_apis/wit/workitems/900", "https://dev.azure.com/other/_apis/wit/workitems/900", "https://dev.azure.com/example/_apis/git/repositories/900", "https://dev.azure.com/example/_apis/wit/workitems/900/extra", "https://u:p@dev.azure.com/example/_apis/wit/workitems/900"]) {
    const calls = [];
    const h = harness({ fetch: async (url, options) => {
      calls.push(url);
      assert.equal(options.credentials, "include");
      assert.equal(options.redirect, "error");
      assert.ok(options.signal instanceof AbortSignal);
      return response({ relations: [{ rel: "System.LinkTypes.Hierarchy-Reverse", url: relationUrl }] });
    } });
    assert.equal(await h.fetchParent(child), null, relationUrl);
    assert.equal(calls.length, 1);
    assert.equal(h.parentCache.size, 0);
  }
  const h = harness({ href: "https://dev.azure.com/other/project/_workitems/edit/12" });
  assert.equal(await h.fetchParent(child), null);
});

test("parent IDs are validated and unsafe HTML links are replaced by a known safe item route", async () => {
  for (const returnedId of ["900", "901", "bad"]) {
    let calls = 0;
    const h = harness({ fetch: async (url) => {
      calls++;
      assert.equal(new URL(url).searchParams.get("fields"),
        calls === 1 ? "System.Id" : "System.Id,System.Title,System.WorkItemType",
        "parent lookup requests only the fields needed for copying");
      return calls === 1
        ? response({ relations: [{ rel: "System.LinkTypes.Hierarchy-Reverse", url: api }] })
        : response({ id: returnedId, fields: { "System.Title": "Parent" }, _links: { html: { href: "https://evil.test/_workitems/edit/900" } } });
    } });
    const parent = await h.fetchParent(child);
    if (returnedId === "900") assert.equal(parent.url, "https://dev.azure.com/example/project/_workitems/edit/900");
    else assert.equal(parent, null);
  }
});

test("redirected parent responses are rejected", async () => {
  let calls = 0;
  const h = harness({ fetch: async () => ++calls === 1
    ? response({ relations: [{ rel: "System.LinkTypes.Hierarchy-Reverse", url: api }] })
    : { ...response({ id: 900, fields: { "System.Title": "Parent" } }), redirected: true } });
  assert.equal(await h.fetchParent(child), null);
});

test("one total deadline bounds hung fetch and JSON calls, evicts cache, and allows retry", async () => {
  for (const hangAtJson of [false, true]) {
    let signal;
    let attempts = 0;
    const h = harness({ timeout: 20, fetch: async (_url, options) => {
      signal = options.signal;
      attempts++;
      if (attempts > 1) return response({ relations: [] });
      if (hangAtJson) return { ok: true, json: () => new Promise(() => {}) };
      return new Promise(() => {});
    } });
    const started = Date.now();
    assert.equal(await h.fetchParent(child), null);
    assert.ok(Date.now() - started < 500);
    assert.equal(signal.aborted, true);
    assert.equal(h.parentCache.size, 0);
    assert.equal(await h.fetchParent(child), null);
    assert.equal(attempts, 2);
  }
});


test("formatted copy synchronously supplies plain text and rich HTML and removes its temporary listener", () => {
  const h = harness();
  const formatted = core.formatWorkItem(child);
  const listenersBefore = h.eventHandlers.copy.length;
  assert.equal(h.writeClipboard(formatted), undefined);
  assert.equal(h.clipboard["text/plain"], "Bug 12: Child");
  assert.equal(h.clipboard["text/html"], '<a href="https://dev.azure.com/example/project/_workitems/edit/12">Bug 12: Child</a>');
  assert.equal(h.eventHandlers.copy.length, listenersBefore);
  h.writeClipboard(core.formatWorkItem(child, { mode: "markdown" }));
  assert.equal(h.clipboard["text/plain"], "[Bug 12: Child](https://dev.azure.com/example/project/_workitems/edit/12)");
  assert.equal(h.clipboard["text/html"], undefined);
});

test("denied, throwing, and missing-data clipboard commands always remove the temporary listener", () => {
  for (const behavior of ["denied", "throw", "missing"]) {
    const h = harness();
    const listenersBefore = h.eventHandlers.copy.length;
    h.setExecCopyBehavior(behavior);
    assert.throws(() => h.writeClipboard(core.formatWorkItem(child)), /Clipboard write was denied|Command failed/);
    assert.equal(h.eventHandlers.copy.length, listenersBefore, behavior);
    h.setExecCopyBehavior("ok");
    h.context.document.execCommand("copy");
    assert.equal(h.clipboard["text/plain"], "Native selected text");
  }
});

test("a native document copy after a completed extension copy remains the final clipboard value", async () => {
  const h = harness();
  await h.copyForTest(child);
  assert.equal(h.clipboard["text/plain"], "Bug 12: Child");
  h.context.document.execCommand("copy");
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.clipboard["text/plain"], "Native selected text");
  assert.equal(h.clipboard["text/html"], undefined);
  assert.equal(h.eventHandlers.copy.length, 1);
});


test("temporary capture copy handler protects formatted output from existing page bubbling copy handlers", () => {
  const h = harness();
  let pageCopies = 0;
  h.context.document.addEventListener("copy", event => {
    pageCopies++;
    event.clipboardData.setData("text/plain", "Page copy override");
    event.clipboardData.setData("text/html", "<b>Page copy override</b>");
    event.preventDefault();
  }, false);
  const listenersBefore = h.eventHandlers.copy.length;
  h.writeClipboard(core.formatWorkItem(child));
  assert.equal(pageCopies, 0);
  assert.equal(h.clipboard["text/plain"], "Bug 12: Child");
  assert.equal(h.clipboard["text/html"], '<a href="https://dev.azure.com/example/project/_workitems/edit/12">Bug 12: Child</a>');
  assert.equal(h.eventHandlers.copy.length, listenersBefore);
  h.context.document.execCommand("copy");
  assert.equal(pageCopies, 1);
  assert.equal(h.clipboard["text/plain"], "Page copy override");
});

test("a newer copy confirmation replaces the older expiration timer on the same control", () => {
  const h = harness();
  const timers = new Map();
  let nextTimer = 0;
  h.context.window.setTimeout = (callback) => { timers.set(++nextTimer, callback); return nextTimer; };
  h.context.window.clearTimeout = (timer) => { timers.delete(timer); };
  const control = new FakeElement();
  h.showConfirmation(control, "First copy");
  h.showConfirmation(control, "Latest copy");
  assert.equal(timers.has(1), false, "the old timer cannot clear the latest copy confirmation");
  assert.equal(timers.size, 1);
  assert.equal(control.dataset.azureNicetiesCopiedLabel, "Latest copy");
  timers.get(2)();
  assert.equal(control.dataset.azureNicetiesCopied, undefined);
  assert.equal(control.dataset.azureNicetiesCopiedLabel, undefined);
});
