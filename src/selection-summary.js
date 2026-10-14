(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof document !== "undefined") api.start(root);
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const ESTIMATES = ["Effort", "Story Points", "Size"];
  const FIELD_NAMES = new Map([
    ["id", "id"], ["systemid", "id"],
    ["title", "title"], ["systemtitle", "title"],
    ["type", "type"], ["workitemtype", "type"], ["systemworkitemtype", "type"],
    ["state", "state"], ["systemstate", "state"],
    ["assignedto", "assignee"], ["systemassignedto", "assignee"],
    ["effort", "Effort"], ["microsoftvstsschedulingeffort", "Effort"],
    ["storypoints", "Story Points"], ["microsoftvstsschedulingstorypoints", "Story Points"],
    ["size", "Size"], ["microsoftvstsschedulingsize", "Size"],
  ]);
  const text = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
  const fieldName = (value) => FIELD_NAMES.get(text(value).toLowerCase().replace(/[^a-z]/g, ""));
  const escapePattern = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let parserLocale;
  let parser;

  function numberFormat(locale, options) {
    try { return new Intl.NumberFormat(locale, options); }
    catch (_) { return new Intl.NumberFormat("en-US", options); }
  }

  function numberParser(locale) {
    if (parser && parserLocale === locale) return parser;
    const format = numberFormat(locale, { useGrouping: false });
    const digitMap = new Map(Array.from({ length: 10 }, (_, digit) => [format.format(digit), String(digit)]));
    const parts = numberFormat(locale).formatToParts(123456789.6);
    const decimal = parts.find((part) => part.type === "decimal")?.value || ".";
    const group = (parts.find((part) => part.type === "group")?.value || ",").replace(/\s/g, " ");
    const groups = parts.filter((part) => part.type === "integer").map((part) => [...part.value].length);
    const primary = groups.at(-1);
    const secondary = groups.at(-2) || primary;
    const separator = escapePattern(group);
    parserLocale = locale;
    parser = { digitMap, group, decimal, pattern: new RegExp(
      `^(?:\\d+|\\d{1,${secondary}}(?:${separator}\\d{${secondary}})*${separator}\\d{${primary}})(?:${escapePattern(decimal)}\\d+)?$`) };
    return parser;
  }

  function estimateNumber(value, locale = "en-US") {
    if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : null;
    const { digitMap, decimal, group, pattern } = numberParser(locale);
    const raw = [...text(value).replace(/[\u061c\u200e\u200f]/g, "")].map((digit) => digitMap.get(digit) ?? digit).join("");
    if (!raw) return null;
    if (!pattern.test(raw)) return null;
    const number = Number(raw.split(group).join("").replace(decimal, "."));
    return Number.isFinite(number) ? number : null;
  }

  function summarize(items, locale = "en-US") {
    const unique = new Map();
    for (const item of items) {
      const previous = unique.get(item.key) || {};
      const merged = { ...previous };
      for (const [name, value] of Object.entries(item)) {
        if (!Object.hasOwn(merged, name) || (value !== "" && value != null)) merged[name] = value;
      }
      unique.set(item.key, merged);
    }
    const rows = [...unique.values()];
    const estimates = ESTIMATES.map((name) => {
      const values = rows.map((row) => estimateNumber(row[name], locale)).filter((value) => value !== null);
      return { name, total: values.reduce((total, value) => total + value, 0), known: values.length,
        missing: rows.length - values.length, displayed: rows.some((row) => Object.hasOwn(row, name)) };
    });
    function counts(field) {
      const result = new Map();
      for (const row of rows) {
        const label = text(row[field]) || "Not displayed";
        result.set(label, (result.get(label) || 0) + 1);
      }
      return [...result].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    }
    return { count: rows.length, estimates, types: counts("type"), states: counts("state"),
      unassigned: rows.filter((row) => Object.hasOwn(row, "assignee")
        && /^(?:|unassigned|not assigned)$/i.test(text(row.assignee))).length,
      assignmentUnknown: rows.filter((row) => !Object.hasOwn(row, "assignee")).length };
  }

  function start(root) {
    const core = root.AzureNicetiesWorkItem;
    const ROW = "[role='row'], tr, .grid-row, .bolt-table-row, .wit-card, .board-card, [data-work-item-id], [data-item-id], [data-azure-niceties-release-row]";
    const GRID = "[role='grid'], [role='treegrid'], [role='table'], table, .grid, .bolt-table";
    const CELL = "[role='gridcell'], [role='cell'], td, .grid-cell, .bolt-table-cell";
    let enabled = false;
    let loadVersion = 0;
    let timer;
    let observer;
    let panel;
    let lastOutput = "";
    let panelHost;

    function visible(row) {
      return !row.closest("[hidden], [aria-hidden='true']") && row.getClientRects().length > 0
        && getComputedStyle(row).visibility !== "hidden";
    }

    function value(element) {
      if (element.querySelector("[data-azure-niceties-release-actions]")) {
        element = element.cloneNode(true);
        element.querySelectorAll("[data-azure-niceties-release-actions]").forEach((actions) => actions.remove());
      }
      const input = element.matches("input:not([type='checkbox']), textarea")
        ? element : element.querySelector("input:not([type='checkbox']), textarea");
      return text(element.getAttribute("data-value") ?? input?.value ?? element.textContent);
    }

    function readRow(row, headerCache) {
      const fields = {};
      const grid = row.closest(GRID);
      if (grid) {
        if (!headerCache.has(grid)) {
          headerCache.set(grid, [...grid.querySelectorAll("[role='columnheader'], th, .grid-header-column, .bolt-table-header-cell")]
            .filter((header) => header.closest(GRID) === grid)
            .map((header, index) => ({ index: header.getAttribute("aria-colindex") || String(index + 1),
              name: fieldName(header.getAttribute("data-field") || header.getAttribute("data-column-name")
                || header.getAttribute("data-column-key") || header.textContent) })));
        }
        const headers = headerCache.get(grid);
        [...row.querySelectorAll(CELL)].filter((cell) => cell.closest(ROW) === row).forEach((cell, index) => {
          const name = headers.find((header) => header.index === (cell.getAttribute("aria-colindex") || String(index + 1)))?.name;
          if (name) fields[name] = value(cell);
        });
      }
      for (const element of row.querySelectorAll("[data-field], [data-column-name], [data-column-key]")) {
        if (element.closest(ROW) !== row) continue;
        const name = fieldName(element.getAttribute("data-field") || element.getAttribute("data-column-name")
          || element.getAttribute("data-column-key"));
        if (name) fields[name] = value(element);
      }
      const links = [...row.querySelectorAll("a[href*='/_workitems/edit/']")].filter((link) => link.closest(ROW) === row);
      const urls = links.map((link) => {
        try { return core.safeWorkItemUrl(new URL(link.getAttribute("href"), location.href).href); }
        catch (_) { return ""; }
      }).filter(Boolean);
      const ids = new Set(urls.map(core.workItemIdFromUrl));
      if (ids.size > 1) return null;
      const linkedId = [...ids][0];
      const attributeId = text(row.getAttribute("data-work-item-id") || row.getAttribute("data-item-id"));
      if (attributeId && fields.id && attributeId !== fields.id) return null;
      const explicitId = attributeId || fields.id;
      const id = explicitId || linkedId;
      if (!/^\d+$/.test(id || "") || (linkedId && explicitId && linkedId !== explicitId)) return null;
      if (!linkedId && !fields.title && !row.querySelector(".work-item-title, .wit-title")) return null;
      fields.type ||= text(row.getAttribute("data-work-item-type") || row.getAttribute("data-item-type") || row.querySelector(".work-item-type, .wit-type")?.textContent);
      const typeIcon = [...row.querySelectorAll("[aria-label], [title]")].find((element) =>
        /^Work item type\s*:/i.test(element.getAttribute("aria-label") || element.title || "")
        || /^(Product Backlog Item|PBI|User Story|US|Test Case|TC|Test Plan|TP|Test Suite|TS|Bug|Task|Feature|Epic|Issue)$/i.test(element.getAttribute("aria-label") || element.title || ""));
      fields.type ||= text(typeIcon?.getAttribute("aria-label") || typeIcon?.title).replace(/^Work item type\s*:?\s*/i, "");
      const source = new URL(urls[0] || location.href);
      const organization = source.hostname === "dev.azure.com" ? source.pathname.split("/")[1].toLowerCase() : "";
      return { ...fields, key: `${source.origin}/${organization}/${id}` };
    }

    function selectedRows() {
      const rows = new Set(document.querySelectorAll(ROW.split(", ").map((selector) =>
        `${selector}[aria-selected='true'], ${selector}.selected, ${selector}.is-selected, ${selector}.grid-row-selected`).join(",")));
      for (const row of document.querySelectorAll("[data-azure-niceties-release-row][data-azure-niceties-release-selected='true']")) rows.add(row);
      for (const checkbox of document.querySelectorAll("[role='checkbox'][aria-checked='true'], input[type='checkbox']:checked")) {
        const row = checkbox.closest(ROW);
        // An explicit unselected row overrides a checked field inside that row.
        const cell = checkbox.closest(CELL);
        const selectionControl = /^select\b/i.test(checkbox.getAttribute("aria-label") || "")
          || (cell && cell === row?.querySelector(CELL) && !cell.matches("[data-field]"));
        if (row && selectionControl && row.getAttribute("aria-selected") !== "false") rows.add(row);
      }
      const headers = new Map();
      const visibleRows = [...rows].filter((row) => !row.hasAttribute("data-azure-niceties-release-row")
        || row.getAttribute("data-azure-niceties-release-selected") === "true")
        .filter(visible);
      const records = visibleRows.map((row) => ({ row, item: readRow(row, headers) })).filter((record) => record.item);
      const sheet = records.find(({ row }) => row.closest("[role='dialog'],.bolt-panel,.ms-Panel"))
        ?.row.closest("[role='dialog'],.bolt-panel,.ms-Panel");
      panelHost = sheet || document.body;
      return records.filter(({ row }) => !sheet || sheet.contains(row)).map(({ item }) => item);
    }

    function removePanel() {
      panel?.remove();
      panel = null;
      lastOutput = "";
    }

    function render() {
      timer = null;
      if (!enabled || !document.body) return;
      const summary = summarize(selectedRows(), document.documentElement.lang || navigator.language);
      if (!summary.count) { removePanel(); return; }
      const number = numberFormat(document.documentElement.lang || navigator.language, { maximumFractionDigits: 6 });
      const formatCounts = (counts) => counts.map(([label, count]) => `${label}: ${count}`).join(" · ");
      const output = JSON.stringify(summary);
      if (output === lastOutput && panel?.isConnected && panel.parentElement === panelHost) return;
      lastOutput = output;
      if (!panel?.isConnected) {
        panel = document.createElement("details");
        panel.dataset.azureNicetiesSummary = "true";
        panel.open = true;
        panelHost.append(panel);
      }
      if (panel.parentElement !== panelHost) panelHost.append(panel);
      const open = panel.open;
      panel.replaceChildren();
      panel.open = open;
      const heading = document.createElement("summary");
      const total = summary.estimates.find((estimate) => estimate.displayed);
      heading.textContent = `${summary.count} selected${total ? ` · ${total.name}: ${total.known ? number.format(total.total) : "—"}${total.missing ? " (partial)" : ""}` : ""}`;
      panel.append(heading);
      const body = document.createElement("div");
      body.className = "azure-niceties-summary-body";
      body.setAttribute("role", "status");
      body.setAttribute("aria-live", "polite");
      function line(label, content) {
        const paragraph = document.createElement("p");
        const strong = document.createElement("strong");
        strong.textContent = `${label}: `;
        paragraph.append(strong, document.createTextNode(content));
        body.append(paragraph);
      }
      for (const estimate of summary.estimates.filter((estimate) => estimate.displayed)) {
        line(estimate.name, `${estimate.known ? number.format(estimate.total) : "—"} total · ${estimate.known}/${summary.count} estimated${estimate.missing ? ` · ${estimate.missing} missing or not displayed` : ""}`);
      }
      if (!summary.estimates.some((estimate) => estimate.displayed)) {
        line("Estimates", "Add an Effort, Story Points, or Size column to see totals.");
      }
      line("Types", formatCounts(summary.types));
      line("States", formatCounts(summary.states));
      if (summary.assignmentUnknown < summary.count) {
        line("Unassigned", `${summary.unassigned}${summary.assignmentUnknown ? ` · ${summary.assignmentUnknown} assignments not displayed` : ""}`);
      }
      const note = document.createElement("p");
      note.className = "azure-niceties-summary-note";
      note.textContent = "Selected rows currently loaded on this page. Hidden or unloaded rows are excluded; estimate fields use separate units.";
      body.append(note);
      panel.append(body);
    }

    function schedule() {
      if (enabled && timer == null) timer = setTimeout(render, 100);
    }

    function observeSelection() {
      if (!enabled || !document.documentElement) return;
      observer ||= new MutationObserver((changes) => {
        if (changes.some((change) => !change.target.closest?.("[data-azure-niceties-summary]")
          && (change.type !== "childList" || [...change.addedNodes, ...change.removedNodes].some((node) =>
            !(node instanceof Element && node.matches("[data-azure-niceties-summary]")))))) schedule();
      });
      observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true,
        attributeFilter: ["aria-selected", "aria-checked", "class", "hidden", "aria-hidden", "style", "data-value", "data-work-item-id", "data-item-id", "data-azure-niceties-release-selected"] });
      schedule();
    }

    async function reload() {
      const version = ++loadVersion;
      enabled = false;
      observer?.disconnect();
      clearTimeout(timer);
      timer = null;
      removePanel();
      try {
        const stored = root.azureNicetiesTestSettings || await chrome.storage.local.get({ selectionSummary: true });
        if (version !== loadVersion || stored.selectionSummary === false) return;
        enabled = true;
        observeSelection();
      } catch (_) {
        // Unavailable local preferences keep selection processing disabled.
      }
    }
    document.addEventListener("change", schedule, true);
    document.addEventListener("DOMContentLoaded", observeSelection);
    document.addEventListener("readystatechange", observeSelection);
    document.addEventListener("input", schedule, true);
    document.addEventListener("click", schedule, true);
    document.addEventListener("keydown", schedule, true);
    window.addEventListener("resize", schedule);
    if (root.chrome?.storage?.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && Object.hasOwn(changes, "selectionSummary")) reload();
      });
    }
    reload();
  }

  return { estimateNumber, summarize, start };
});
