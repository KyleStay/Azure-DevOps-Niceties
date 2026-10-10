const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const core = require("../src/work-item.js");
const source = fs.readFileSync(require.resolve("../src/content.js"), "utf8").replace(/\}\)\(\);\s*$/, `globalThis.contentHelpers = {
  titleWithoutWorkItemPrefix, extractWorkItem, isWorkItemCopyControl, fetchParent,
  parentApiUrl, parentCache, activeParentLookups, nativeFallbackControls, reloadConsent, writeClipboard, showConfirmation,
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
    window: { setTimeout: (fn, ms) => setTimeout(fn, ms === 3000 ? timeout : ms), clearTimeout,
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

test("work-item processing remains off until local consent loads and turns off on revoke", async () => {
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
