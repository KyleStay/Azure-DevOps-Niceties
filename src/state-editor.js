(function (root, factory) {
  const core = root.AzureNicetiesWorkItem || (typeof require === "function" ? require("./work-item.js") : null);
  const client = root.AzureNicetiesStateClient || (typeof require === "function" ? require("./state-client.js") : null);
  const api = factory(core, client);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof document !== "undefined") api.start(root);
})(typeof globalThis !== "undefined" ? globalThis : this, function (core, stateApi) {
  "use strict";

  const STRUCTURAL_ROW = "[role='row'],[role='listitem'],tr,li,.grid-row,.bolt-table-row,.wit-card,.board-card,.work-item-card,.workitem-card,.work-item-row,.workitem-row";
  const ROW = `${STRUCTURAL_ROW},[data-work-item-id],[data-item-id]`;
  const GRID = "[role='grid'],[role='treegrid'],[role='table'],.grid,.bolt-table,.work-item-grid,.work-items-grid,.workitem-grid,.workitems-grid,.work-item-list,.workitems-list,.work-items-list,.release-work-items";
  const CELL = "[role='gridcell'],[role='cell'],td,.grid-cell,.bolt-table-cell";
  const HEADER = "[role='columnheader'],th,.grid-header-column,.bolt-table-header-cell";
  const FIELD_ATTRIBUTES = ["data-field", "data-field-name", "data-field-reference-name", "data-column-name", "data-column-key", "data-column-id"];
  const FIELD = FIELD_ATTRIBUTES.map(name => `[${name}]`).join(",");
  const STATE = ".work-item-state,.wit-state,.state-value,.bolt-workitem-state-text,[data-state],[data-azure-niceties-release-field='state']";
  const TRIGGER = "[data-azure-niceties-state-trigger]";
  const MENU = "[data-azure-niceties-state-menu]";
  const EDITABLE = "input:not([type='checkbox']):not([type='hidden']):not([readonly]):not([disabled]),textarea:not([readonly]):not([disabled]),select:not([disabled]),[contenteditable]:not([contenteditable='false']),[role='textbox'],[role='combobox']";

  function canonicalField(value) {
    const name = core.normalizeWhitespace(value).toLowerCase().replace(/[^a-z]/g, "").replace(/^system/, "");
    return ["id", "title", "state", "type", "workitemtype"].includes(name) ? name : "";
  }

  function fieldName(element) {
    return FIELD_ATTRIBUTES.map(name => canonicalField(element.getAttribute(name))).find(Boolean) || "";
  }

  function rowOwner(element) {
    // Item metadata on a title link or state span belongs to its structural row.
    return element.closest(STRUCTURAL_ROW) || element.closest(ROW);
  }

  function gridOwner(element) {
    // Backlogs can render headers outside a separate table used for row layout.
    const grid = element.closest(GRID);
    const table = element.closest("table");
    if (!table || !grid || table.contains(grid)) return grid || table;
    return table.matches("[role='presentation'],[role='none']") || !table.querySelector(HEADER) ? grid : table;
  }

  function headerField(header) {
    const explicit = fieldName(header) || canonicalField(header.getAttribute("aria-label")) || canonicalField(header.getAttribute("title"));
    if (explicit) return explicit;
    const nodes = nativeTextNodes(header);
    const joined = canonicalField(nodes.map(node => node.nodeValue).join(""));
    if (joined) return joined;
    const labels = new Set(nodes.map(node => canonicalField(node.nodeValue)).filter(Boolean));
    return labels.size === 1 ? [...labels][0] : "";
  }

  function nativeTextNodes(element) {
    const nodes = [];
    function visit(node) {
      if (node.nodeType === 3) { nodes.push(node); return; }
      if (node !== element && node.matches?.(`${TRIGGER},${MENU},svg,script,style,[hidden],[aria-hidden='true']`)) return;
      for (const child of node.childNodes || []) visit(child);
    }
    visit(element);
    return nodes;
  }

  function stateValue(cell) {
    const nodes = nativeTextNodes(cell);
    const text = core.normalizeWhitespace(nodes.map(node => node.nodeValue).join(""));
    return core.normalizeWhitespace(cell.getAttribute("data-value") || text || cell.querySelector(TRIGGER)?.textContent || "");
  }

  function workItemContext(row, scope, fields, pageUrl) {
    if (row.matches("[data-work-item-id],.wit-card,.board-card,.work-item-card,.workitem-card")
      || scope?.matches(".work-item-grid,.work-items-grid,.workitem-grid,.workitems-grid,.work-item-list,.workitems-list,.work-items-list,.release-work-items")
      || fields.has("workitemtype") || fields.has("type")) return true;
    const url = new URL(pageUrl);
    return /\/_(?:workitems|queries|boards|backlogs|sprints)(?:[/?#]|$)/i.test(url.pathname + url.hash)
      || (/\/_release(?:Progress)?(?:[/?#]|$)/i.test(url.pathname) && url.searchParams.get("_a") === "workitems");
  }

  function findTargets(document, pageUrl, visible = element => element.getClientRects().length > 0) {
    const organization = stateApi.organizationUrl(pageUrl);
    if (!organization) return [];
    const headerCache = new Map();
    const targets = [];
    for (const row of document.querySelectorAll(ROW)) {
      if (rowOwner(row) !== row || !visible(row) || row.closest("[hidden],[aria-hidden='true'],[contenteditable]:not([contenteditable='false'])")
        || [...row.querySelectorAll(EDITABLE)].some(control => rowOwner(control) === row && visible(control))) continue;
      const scope = gridOwner(row);
      if (scope && !headerCache.has(scope)) {
        headerCache.set(scope, [...scope.querySelectorAll(HEADER)]
          .filter(header => gridOwner(header) === scope && !header.hasAttribute("data-azure-niceties-release-column") && !core.isPresentationCell(header))
          .map((header, index) => ({ index: core.columnIndex(header, index),
            field: headerField(header) })));
      }
      const headers = headerCache.get(scope) || [];
      const fields = new Map();
      const candidates = new Set();
      [...row.querySelectorAll(CELL)].filter(cell => rowOwner(cell) === row && !cell.hasAttribute("data-azure-niceties-release-column") && !core.isPresentationCell(cell)).forEach((cell, index) => {
        const field = fieldName(cell) || headers.find(header => header.index === (core.columnIndex(cell, index)))?.field;
        if (field) fields.set(field, cell);
        if (field === "state") candidates.add(cell);
      });
      for (const cell of row.querySelectorAll(`${FIELD},${STATE}`)) {
        if (rowOwner(cell) !== row) continue;
        if (fieldName(cell) === "state" || cell.matches(STATE)) candidates.add(cell);
        if (fieldName(cell)) fields.set(fieldName(cell), cell);
      }
      if (!candidates.size) continue;
      const attributeId = row.getAttribute("data-work-item-id") || row.getAttribute("data-item-id") || "";
      const cellId = core.normalizeWhitespace(fields.get("id")?.textContent || "").replace(/^#/, "");
      if ((attributeId && !/^[1-9]\d*$/.test(attributeId)) || (cellId && !/^[1-9]\d*$/.test(cellId)) || (attributeId && cellId && attributeId !== cellId)) continue;
      const links = [...row.querySelectorAll("a[href*='/_workitems/edit/' i]")].filter(link => rowOwner(link) === row);
      let routes;
      try { routes = links.map(link => stateApi.itemRoute(new URL(link.getAttribute("href"), pageUrl).href, pageUrl)); }
      catch (_) { continue; }
      const ids = new Set(routes.map(route => route.id));
      if (ids.size > 1) continue;
      const id = attributeId || cellId || routes[0]?.id;
      if (!id || (routes[0] && routes[0].id !== id)) continue;
      if (!links.length && !workItemContext(row, scope, fields, pageUrl)) continue;
      const expectedType = core.normalizeWhitespace(fields.get("workitemtype")?.textContent || fields.get("type")?.textContent
        || row.getAttribute("data-work-item-type") || row.getAttribute("data-item-type") || "");
      let route;
      try { route = routes[0] || stateApi.itemRoute(`${organization}/_workitems/edit/${id}`, pageUrl); }
      catch (_) { continue; }
      for (const cell of candidates) {
        if (!visible(cell) || cell.closest("[hidden],[aria-hidden='true']") || [...candidates].some(other => other !== cell && other.contains(cell))) continue;
        const interactive = [...cell.querySelectorAll("button,input,textarea,select,a[href],[role='button'],[role='combobox'],[contenteditable]:not([contenteditable='false'])")]
          .some(control => !control.matches(TRIGGER) && visible(control));
        const state = stateValue(cell);
        if (!interactive && state) targets.push({ row, cell, ...route, state, expectedType });
      }
    }
    return targets;
  }

  function start(root) {
    const document = root.document;
    const bindings = new Map();
    let enabled = false;
    let loadVersion = 0;
    let client;
    let pageUrl = root.location.href;
    let menu;
    let observer;
    let timer;
    let status;

    function visible(element) {
      const style = root.getComputedStyle(element);
      return element.isConnected && !element.closest("[hidden],[aria-hidden='true']") && element.getClientRects().length > 0
        && !["hidden", "collapse"].includes(style.visibility) && style.opacity !== "0";
    }

    function announce(message) {
      if (!document.body) return;
      if (!status?.isConnected) {
        status = document.createElement("div");
        status.dataset.azureNicetiesStateStatus = "true";
        status.setAttribute("role", "status");
        status.setAttribute("aria-live", "polite");
        document.body.append(status);
      }
      status.textContent = message;
    }

    function restore(binding) {
      for (const [node, value] of binding.blanked) if (node.isConnected && node.nodeValue === "") node.nodeValue = value;
      if (binding.button.isConnected && !core.normalizeWhitespace(nativeTextNodes(binding.target.cell).map(node => node.nodeValue).join(""))) {
        binding.button.before(document.createTextNode(binding.label.textContent));
      }
      binding.button.remove();
      bindings.delete(binding.target.cell);
    }

    function blankText(binding, state) {
      for (const node of binding.blanked.keys()) if (!node.isConnected) binding.blanked.delete(node);
      const nodes = nativeTextNodes(binding.target.cell);
      const matches = nodes.filter(node => core.normalizeWhitespace(node.nodeValue) === state);
      const selected = matches.length ? matches : core.normalizeWhitespace(nodes.map(node => node.nodeValue).join("")) === state ? nodes : [];
      if (!selected.length) return null;
      for (const node of selected) { binding.blanked.set(node, node.nodeValue); node.nodeValue = ""; }
      return selected[0];
    }

    function labelState(binding, state) {
      let first = true;
      for (const [node] of binding.blanked) {
        if (!node.isConnected) continue;
        binding.blanked.set(node, first ? state : "");
        first = false;
      }
      if (binding.label.textContent !== state) binding.label.textContent = state;
    }

    function closeMenu(focus = true) {
      if (!menu) return;
      const previous = menu;
      menu = null;
      if (!previous.saving) previous.controller.abort();
      previous.element.remove();
      previous.binding.button.setAttribute("aria-expanded", "false");
      previous.binding.button.removeAttribute("aria-controls");
      if (focus && previous.binding.button.isConnected) previous.binding.button.focus();
    }

    function current(target) {
      return enabled && root.location.href === pageUrl && visible(target.cell)
        && findTargets(document, pageUrl, visible).some(candidate => candidate.cell === target.cell && candidate.key === target.key);
    }

    function updateState(key, state, color = "") {
      for (const binding of bindings.values()) {
        if (binding.target.key !== key || !current(binding.target)) continue;
        blankText(binding, stateValue(binding.target.cell));
        // Keep the saved value available for clean opt-out restoration.
        labelState(binding, state);
        binding.target.state = state;
        binding.button.setAttribute("aria-label", `Change state of work item ${binding.target.id}, currently ${state}`);
        if (binding.target.cell.hasAttribute("data-value")) binding.target.cell.setAttribute("data-value", state);
        if (color) {
          const dot = binding.target.cell.querySelector(".state-circle,.state-indicator,.work-item-state-circle,[data-state-color]");
          if (dot) dot.style.backgroundColor = color;
        }
      }
    }

    function positionMenu() {
      if (!menu) return;
      if (!current(menu.binding.target)) { closeMenu(false); return; }
      const anchor = menu.binding.button.getBoundingClientRect();
      const box = menu.element.getBoundingClientRect();
      menu.element.style.left = `${Math.max(8, Math.min(anchor.left, root.innerWidth - box.width - 8))}px`;
      menu.element.style.top = `${Math.max(8, Math.min(anchor.bottom + 4, root.innerHeight - box.height - 8))}px`;
    }

    async function choose(editor, state) {
      if (menu !== editor || editor.saving || !editor.session || !current(editor.binding.target)) return;
      if (state === editor.session.state) { closeMenu(); return; }
      editor.saving = true;
      editor.element.setAttribute("aria-busy", "true");
      editor.message.textContent = "Saving…";
      editor.choices.querySelectorAll("button").forEach(button => { button.disabled = true; });
      const savingClient = client;
      const savingPage = pageUrl;
      try {
        const saved = await savingClient.save(editor.session, state, () => client === savingClient && current(editor.binding.target));
        if (enabled && client === savingClient && root.location.href === savingPage) {
          updateState(saved.key, saved.state, saved.choices.find(choice => choice.name === saved.state)?.color);
          try {
            root.postMessage?.({ type: "azure-niceties-state-saved", id: saved.id, rev: saved.rev }, new URL(root.location.href).origin);
          } catch (_) { /* Form synchronization cannot turn a confirmed save into a save error. */ }
          announce(`Work item ${saved.id} saved as ${saved.state}.`);
          editor.binding.button.disabled = false;
          if (menu === editor) closeMenu();
        }
      } catch (error) {
        if (menu === editor) {
          editor.message.textContent = error.message || "Could not save the state. Open the work item and try again.";
          editor.message.setAttribute("role", "alert");
          editor.link.hidden = false;
          editor.element.querySelector("[data-azure-niceties-state-close]")?.focus();
          // A new picker fetches the latest revision before another save attempt.
        }
      } finally {
        editor.saving = false;
        editor.element.removeAttribute("aria-busy");
        schedule();
      }
    }

    async function openMenu(binding) {
      if (!current(binding.target) || client.saving.has(binding.target.key)) return;
      closeMenu(false);
      const element = document.createElement("div");
      element.dataset.azureNicetiesStateMenu = "true";
      const heading = document.createElement("strong");
      heading.textContent = `State · #${binding.target.id}`;
      const dismiss = document.createElement("button");
      dismiss.type = "button";
      dismiss.dataset.azureNicetiesStateClose = "true";
      dismiss.textContent = "Close";
      const message = document.createElement("p");
      message.setAttribute("role", "status");
      message.textContent = "Loading states…";
      const choices = document.createElement("div");
      choices.setAttribute("role", "listbox");
      choices.id = "azure-niceties-state-options";
      choices.setAttribute("aria-label", `State for work item ${binding.target.id}`);
      const link = document.createElement("a");
      link.href = binding.target.url;
      link.textContent = "Open work item";
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.hidden = true;
      element.append(heading, dismiss, message, choices, link);
      (binding.target.cell.closest("[role='dialog'],.bolt-panel,.ms-Panel,.ui-dialog") || document.body).append(element);
      const editor = { element, binding, message, choices, link, controller: new AbortController(), saving: false, session: null };
      menu = editor;
      binding.button.setAttribute("aria-expanded", "true");
      binding.button.setAttribute("aria-controls", choices.id);
      // Top-layer placement avoids clipping by scrollable lists and native panels.
      if (typeof element.showPopover === "function") { element.setAttribute("popover", "manual"); element.showPopover(); }
      positionMenu();
      dismiss.focus();
      try {
        const session = await client.inspect(binding.target.url, editor.controller.signal);
        if (menu !== editor || !current(binding.target)) return;
        if (binding.target.expectedType && core.shortType(session.type).toLowerCase() !== core.shortType(binding.target.expectedType).toLowerCase()) {
          throw new Error("This row no longer matches the work item. Refresh the list before changing its state.");
        }
        editor.session = session;
        updateState(session.key, session.state, session.choices.find(choice => choice.name === session.state)?.color);
        message.textContent = session.choices.length > 1 ? "Choose a state to save immediately." : "No other states are available.";
        for (const choice of session.choices) {
          const option = document.createElement("button");
          option.type = "button";
          option.setAttribute("role", "option");
          option.setAttribute("aria-selected", String(choice.name === session.state));
          option.dataset.azureNicetiesStateChoice = choice.name;
          option.textContent = choice.name;
          option.tabIndex = choice.name === session.state ? 0 : -1;
          choices.append(option);
        }
        choices.querySelector("[aria-selected='true']")?.focus();
        positionMenu();
      } catch (error) {
        if (menu === editor) {
          message.textContent = error.message || "Could not load states. Close the picker and try again.";
          message.setAttribute("role", "alert");
          link.hidden = false;
        }
      }
    }

    function scan() {
      timer = null;
      if (!enabled || !document.body) return;
      if (root.location.href !== pageUrl) {
        closeMenu(false);
        client?.close();
        for (const binding of [...bindings.values()]) restore(binding);
        pageUrl = root.location.href;
        client = new stateApi.StateClient({ pageUrl, fetch: root.fetch.bind(root) });
      }
      const targets = findTargets(document, pageUrl, visible);
      const byCell = new Map(targets.map(target => [target.cell, target]));
      for (const [cell, binding] of bindings) {
        const target = byCell.get(cell);
        if (!target || target.key !== binding.target.key || !binding.button.isConnected) {
          if (menu?.binding === binding) closeMenu(false);
          restore(binding);
        }
      }
      for (const target of targets) {
        let binding = bindings.get(target.cell);
        if (!binding) {
          const button = document.createElement("button");
          button.type = "button";
          button.dataset.azureNicetiesStateTrigger = "true";
          button.setAttribute("aria-haspopup", "listbox");
          button.setAttribute("aria-expanded", "false");
          const label = document.createElement("span");
          label.textContent = target.state;
          button.append(label);
          binding = { target, button, label, blanked: new Map() };
          const text = blankText(binding, target.state);
          if (!text) continue;
          text.parentNode.insertBefore(button, text);
          bindings.set(target.cell, binding);
        } else {
          blankText(binding, target.state);
          binding.target = target;
          labelState(binding, target.state);
        }
        const name = `Change state of work item ${target.id}, currently ${target.state}`;
        if (binding.button.getAttribute("aria-label") !== name) binding.button.setAttribute("aria-label", name);
        if (binding.button.title !== "Change state and save immediately") binding.button.title = "Change state and save immediately";
        binding.button.disabled = client.saving.has(target.key);
      }
      if (menu && !current(menu.binding.target)) closeMenu(false);
    }

    function schedule() { if (enabled && timer == null) timer = root.setTimeout(scan, 100); }

    function observe() {
      if (!enabled || !document.documentElement || !root.MutationObserver) return;
      document.documentElement.setAttribute("data-azure-niceties-state-editing", "true");
      observer ||= new root.MutationObserver(changes => {
        if (changes.some(change => !(change.target.nodeType === 1 ? change.target : change.target.parentElement)?.closest(`${TRIGGER},${MENU}`))) schedule();
      });
      observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true,
        attributeFilter: ["class", "style", "hidden", "aria-hidden", "aria-colindex", "aria-label", "title", "href", "data-value", ...FIELD_ATTRIBUTES, "data-work-item-id", "data-item-id"] });
      schedule();
    }

    async function reload() {
      const version = ++loadVersion;
      enabled = false;
      document.documentElement?.setAttribute("data-azure-niceties-state-editing", "false");
      observer?.disconnect();
      root.clearTimeout(timer);
      timer = null;
      closeMenu(false);
      client?.close();
      for (const binding of [...bindings.values()]) restore(binding);
      status?.remove();
      try {
        const settings = root.azureNicetiesTestSettings || await root.chrome?.storage?.local?.get({ inlineStateEditing: true });
        if (version !== loadVersion || !settings) return;
        enabled = settings.inlineStateEditing !== false;
        pageUrl = root.location.href;
        if (enabled) { client = new stateApi.StateClient({ pageUrl, fetch: root.fetch.bind(root) }); observe(); }
      } catch (_) { /* An unavailable preference keeps state editing off. */ }
    }

    document.addEventListener("click", event => {
      const trigger = event.target.closest?.(TRIGGER);
      const popup = event.target.closest?.(MENU);
      if (trigger || popup) {
        event.stopImmediatePropagation();
        if (!event.isTrusted) return;
        if (!event.target.closest?.("a[href]")) event.preventDefault();
        if (trigger) {
          const binding = [...bindings.values()].find(candidate => candidate.button === trigger);
          if (binding && !trigger.disabled) {
            if (menu?.binding === binding) closeMenu();
            else openMenu(binding);
          }
        } else if (event.target.closest("[data-azure-niceties-state-close]")) closeMenu();
        else {
          const choice = event.target.closest("[data-azure-niceties-state-choice]");
          if (choice && !choice.disabled && menu) choose(menu, choice.dataset.azureNicetiesStateChoice);
        }
      } else if (menu) closeMenu(false);
    }, true);
    for (const type of ["pointerdown", "pointerup", "mousedown", "mouseup", "dblclick", "keyup"]) document.addEventListener(type, event => {
      if (event.target.closest?.(`${TRIGGER},${MENU}`)) event.stopImmediatePropagation();
      else if (menu && (type === "pointerdown" || type === "mousedown")) closeMenu(false);
    }, true);
    document.addEventListener("keydown", event => {
      if (!event.isTrusted) return;
      if (menu && event.key === "Escape") {
        event.stopImmediatePropagation(); event.preventDefault(); closeMenu(); return;
      }
      if (!event.target.closest?.(`${TRIGGER},${MENU}`)) return;
      if (!menu && event.target.closest?.(TRIGGER) && (event.ctrlKey || event.metaKey || event.altKey)) return;
      event.stopImmediatePropagation();
      if (event.key === "Escape") { event.preventDefault(); closeMenu(); return; }
      if (event.key === "Tab") { if (menu) closeMenu(); return; }
      if (!menu || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      const options = [...menu.choices.querySelectorAll("button:not(:disabled)")];
      if (!options.length) return;
      event.preventDefault();
      let index = options.indexOf(document.activeElement);
      index = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1
        : (index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
      options.forEach((option, i) => { option.tabIndex = i === index ? 0 : -1; });
      options[index].focus();
    }, true);
    document.addEventListener("DOMContentLoaded", observe);
    document.addEventListener("readystatechange", observe);
    document.addEventListener("scroll", positionMenu, true);
    root.addEventListener("resize", positionMenu);
    root.addEventListener("popstate", schedule);
    root.addEventListener("hashchange", schedule);
    root.chrome?.storage?.onChanged?.addListener((changes, area) => {
      if (area === "local" && Object.hasOwn(changes, "inlineStateEditing")) reload();
    });
    reload();
  }

  return { findTargets, stateValue, nativeTextNodes, start };
});
