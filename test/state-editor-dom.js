// Small DOM fixture for state-editor behavior. Browser smoke tests cover layout.
const fs = require("node:fs");
const vm = require("node:vm");
const { fakeTimers } = require("./fake-timers.js");
const flush = () => new Promise(resolve => setImmediate(resolve));

function fixture({ saveError = null, holdRead = false, holdSave = false, notificationError = false, pageUrl = "https://dev.azure.com/example/project/_queries/query/1" } = {}) {
  const handlers = new Map();
  const timers = fakeTimers();
  let notify;
  let preferencesChanged;
  let enabled = true;
  let finishRead;
  let finishSave;
  const requests = [];
  const messages = [];
  let item = { id: 701, rev: 4, fields: { "System.Id": 701, "System.State": "New", "System.WorkItemType": "Bug", "System.TeamProject": "project" } };
  const definition = { name: "Bug", states: [{ name: "New" }, { name: "Active", color: "0078d4" }], transitions: { New: [{ to: "Active" }] } };
  let document;

  class Node {
    constructor(type, value = "") { this.nodeType = type; this.nodeValue = value; this.parentNode = null; this.childNodes = []; }
    get parentElement() { return this.parentNode; }
    get isConnected() { for (let node = this; node; node = node.parentNode) if (node === document.documentElement) return true; return false; }
    get textContent() { return this.nodeType === 3 ? this.nodeValue : this.childNodes.map(node => node.textContent).join(""); }
    set textContent(value) { for (const child of this.childNodes) child.parentNode = null; this.childNodes = []; if (value) this.append(new Node(3, String(value))); }
    append(...children) { for (const child of children) { child.remove(); child.parentNode = this; this.childNodes.push(child); } }
    insertBefore(child, next) { child.remove(); child.parentNode = this; this.childNodes.splice(this.childNodes.indexOf(next), 0, child); }
    before(child) { this.parentNode.insertBefore(child, this); }
    remove() { if (this.parentNode) this.parentNode.childNodes = this.parentNode.childNodes.filter(node => node !== this); this.parentNode = null; }
  }

  class Element extends Node {
    constructor(tag) {
      super(1); this.tagName = tag.toUpperCase(); this.attributes = {}; this.style = {};
      this.dataset = new Proxy({}, {
        get: (_, key) => this.getAttribute(`data-${key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`) ?? undefined,
        set: (_, key, value) => { this.setAttribute(`data-${key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`, value); return true; },
      });
    }
    get children() { return this.childNodes.filter(child => child.nodeType === 1); }
    getAttribute(name) { return this.attributes[name] ?? null; }
    hasAttribute(name) { return Object.hasOwn(this.attributes, name); }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    removeAttribute(name) { delete this.attributes[name]; }
    get disabled() { return this.hasAttribute("disabled"); }
    set disabled(value) { if (value) this.setAttribute("disabled", ""); else this.removeAttribute("disabled"); }
    get hidden() { return this.hasAttribute("hidden"); }
    set hidden(value) { if (value) this.setAttribute("hidden", ""); else this.removeAttribute("hidden"); }
    matches(selector) {
      return selector.split(",").some(part => {
        let rejected = false;
        part = part.trim().replace(/:not\(([^()]*)\)/g, (_, excluded) => { if (this.matches(excluded)) rejected = true; return ""; });
        if (rejected || (part.includes(":disabled") && !this.disabled)) return false;
        part = part.replace(/:disabled/g, "");
        const tag = part.match(/^[a-z][\w-]*/i)?.[0];
        if (tag && tag.toUpperCase() !== this.tagName) return false;
        const attributes = [...part.matchAll(/\[([\w-]+)(?:(\*=|=)['"]?([^'"\]]*?)['"]?(?: (i))?)?\]/g)];
        if (attributes.some(([, name, operator, expected, insensitive]) => {
          let actual = this.getAttribute(name);
          if (actual == null) return true;
          if (!operator) return false;
          if (insensitive) { actual = actual.toLowerCase(); expected = expected.toLowerCase(); }
          return operator === "=" ? actual !== expected : !actual.includes(expected);
        })) return false;
        const classes = [...part.replace(/\[[^\]]*\]/g, "").matchAll(/\.([\w-]+)/g)].map(match => match[1]);
        return classes.every(name => (this.getAttribute("class") || "").split(/\s+/).includes(name));
      });
    }
    closest(selector) { for (let node = this; node; node = node.parentElement) if (node.matches?.(selector)) return node; return null; }
    querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    contains(node) { for (let current = node; current; current = current.parentNode) if (current === this) return true; return false; }
    getClientRects() { return this.isConnected && !this.closest("[hidden]") ? [{}] : []; }
    getBoundingClientRect() { return { left: 10, top: 10, bottom: 30, right: 210, width: 200, height: 100 }; }
    focus() { document.activeElement = this; }
  }

  document = {
    createElement: tag => new Element(tag), createTextNode: value => new Node(3, value), activeElement: null,
    addEventListener(type, handler) { if (!handlers.has(type)) handlers.set(type, []); handlers.get(type).push(handler); },
    querySelectorAll(selector) { return this.documentElement.querySelectorAll(selector); },
  };
  document.documentElement = new Element("html");
  document.body = new Element("body");
  document.documentElement.append(document.body);
  const table = new Element("table");
  const header = new Element("tr");
  for (const name of ["ID", "Title", "State"]) { const cell = new Element("th"); cell.textContent = name; header.append(cell); }
  const row = new Element("tr");
  row.setAttribute("data-item-id", "701");
  const cells = [new Element("td"), new Element("td"), new Element("td")];
  cells[0].textContent = "701"; cells[1].textContent = "Fix search"; cells[2].textContent = "New";
  row.append(...cells); table.append(header, row); document.body.append(table);
  const root = {
    URL, AbortController,
    document, location: { href: pageUrl }, innerWidth: 1024, innerHeight: 768,
    AzureNicetiesWorkItem: require("../src/work-item.js"), AzureNicetiesStateClient: require("../src/state-client.js"),
    setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout, addEventListener() {},
    postMessage(message, origin) { if (notificationError) throw Error("Notification failed"); messages.push({ message, origin }); },
    getComputedStyle: () => ({ visibility: "visible", opacity: "1" }),
    MutationObserver: class { constructor(callback) { notify = callback; } observe() {} disconnect() {} },
    chrome: { storage: { local: { get: async defaults => ({ ...defaults, inlineStateEditing: enabled }) },
      onChanged: { addListener(callback) { preferencesChanged = callback; } } } },
    fetch: async (url, options) => {
      requests.push({ url, options });
      if (options.method === "PATCH") {
        if (holdSave) await new Promise(resolve => { finishSave = resolve; });
        if (saveError) return { ok: false, status: 400, json: async () => ({ message: saveError }) };
        item = { ...item, rev: item.rev + 1, fields: { ...item.fields, "System.State": JSON.parse(options.body)[1].value } };
      } else if (!url.includes("/workitemtypes/") && holdRead) await new Promise(resolve => { finishRead = resolve; });
      return { ok: true, json: async () => url.includes("/workitemtypes/") ? definition : item };
    },
  };
  vm.runInNewContext(fs.readFileSync(require.resolve("../src/state-editor.js"), "utf8"), root);
  return {
    document, cells, row, requests, messages,
    async ready() { await flush(); await timers.advance(100); },
    async event(type, target, values = {}) {
      const event = { target, isTrusted: true, preventDefault() {}, stopImmediatePropagation() { this.stopped = true; }, ...values };
      for (const handler of handlers.get(type) || []) { handler(event); if (event.stopped) break; }
      await flush();
      return event;
    },
    async scan() { notify([{ target: row }]); await timers.advance(100); await flush(); },
    async revoke() { enabled = false; preferencesChanged({ inlineStateEditing: { newValue: false } }, "local"); await flush(); },
    finishRead() { finishRead?.(); }, finishSave() { finishSave?.(); },
  };
}

module.exports = { fixture };
