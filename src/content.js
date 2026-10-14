(function () {
  "use strict";

  const core = globalThis.AzureNicetiesWorkItem;
  const parentCache = new Map();
  const activeParentLookups = new Set();
  const PARENT_CACHE_TTL_MS = 30_000;
  const PARENT_LOOKUP_TIMEOUT_MS = 3_000;
  let enabled = false;
  let consentLoad = 0;
  const nativeFallbackControls = new WeakSet();
  const confirmationTimers = new WeakMap();
  let hoveredContainer = null;
  let latestCopyRequest = 0;
  let clipboardWriteQueue = Promise.resolve();
  let clipboardWriteInProgress = false;
  let invokingExtensionClipboardWrite = false;
  let nativeCopyClickInProgress = false;
  const releaseLists = new Map();
  let releaseObserver;
  let releaseTimer;
  let releasePrompt;
  const RELEASE_ROW = "[role='row'],tr,.grid-row,.bolt-table-row,[role='listitem'],li,.work-item-row,.workitem-row";
  const RELEASE_SCOPE = "[role='grid'],[role='treegrid'],[role='table'],table,.grid,.bolt-table,.work-item-grid,.work-items-grid,.workitem-grid,.workitems-grid,.work-item-list,.workitems-list,.work-items-list,.release-work-items";
  const RELEASE_ACTIONS = "[data-azure-niceties-release-actions]";

  const COPY_CONTROL_SELECTOR = [
    "button[aria-label*='copy' i]",
    "button[title*='copy' i]",
    "[role='button'][aria-label*='copy' i]",
    "[role='button'][title*='copy' i]",
  ].join(",");
  const GENERIC_WORK_ITEM_COPY_LABEL_PATTERN = /^(?:copy (?:link|title|url)|copy work item(?: (?:link|title|url))?(?: to clipboard)?)$/i;
  const FORM_COPY_CONTEXT_SELECTOR = [
    ".work-item-form",
    ".work-item-form-header",
    "[data-testid='work-item-form']",
  ].join(",");
  const FORM_SELECTOR = `${FORM_COPY_CONTEXT_SELECTOR},.work-item-form-page`;
  const ITEM_CONTAINER_SELECTOR = [
    "[data-work-item-id]",
    "[data-item-id]",
    ".wit-card",
    ".board-card",
    "[class*='work-item-card']",
    "[role='row']",
    "tr",
    ".grid-row",
    ".bolt-table-row",
    "[data-azure-niceties-release-row]",
  ].join(",");
  const CONTAINER_SELECTOR = `${ITEM_CONTAINER_SELECTOR},${FORM_SELECTOR}`;
  const TITLE_FIELD_SELECTORS = [
    "[data-field='System.Title'] input",
    "input[aria-label='Title field' i]",
    "input[aria-label='Title' i]",
    "textarea[aria-label='Title' i]",
  ];
  const TITLE_TEXT_SELECTORS = [
    "[data-testid*='title' i]",
    ".work-item-title",
    ".wit-title",
    ".clickable-title",
  ];
  const TYPE_SELECTORS = [
    "[data-field='System.WorkItemType'] input",
    "[data-testid*='type' i]",
    "[aria-label^='Work item type' i]",
    ".work-item-type",
    ".wit-type",
  ];

  function absoluteUrl(value) {
    try {
      return new URL(value, location.href).href;
    } catch (_error) {
      return "";
    }
  }

  function attributeValue(element, names) {
    for (const name of names) {
      const value = element && element.getAttribute && element.getAttribute(name);
      if (value) return value;
    }
    return "";
  }

  function elementValue(element) {
    return core.normalizeWhitespace(
      attributeValue(element, ["data-title"])
      || (element && "value" in element && element.value)
      || attributeValue(element, ["aria-label", "title"])
      || (element && element.textContent)
    );
  }

  function firstMatch(container, selectors) {
    for (const selector of selectors) {
      const match = container.querySelector(selector);
      if (match) return match;
    }
    return null;
  }

  function associationCounts(container) {
    const copyControls = Array.from(container.querySelectorAll(COPY_CONTROL_SELECTOR));
    return {
      links: container.querySelectorAll("a[href*='/_workitems/edit/']").length,
      competingLinks: Array.from(container.querySelectorAll("a[href]")).some((link) =>
        !core.safeWorkItemUrl(absoluteUrl(link.getAttribute("href")))
      ),
      copyControls: copyControls.length,
      genericWorkItemCopyControls: copyControls.filter((control) => {
        const label = core.normalizeWhitespace(attributeValue(control, ["aria-label", "title"]));
        return GENERIC_WORK_ITEM_COPY_LABEL_PATTERN.test(label);
      }).length,
    };
  }

  function findContainer(start) {
    if (!(start instanceof Element)) return null;
    const direct = start.closest(CONTAINER_SELECTOR);
    if (direct?.querySelectorAll("a[href*='/_workitems/edit/']").length === 1) return direct;

    let ancestor = start.parentElement;
    for (let depth = 0; ancestor && depth < 4; depth += 1, ancestor = ancestor.parentElement) {
      if (ancestor.matches("header, nav, [role='banner']")) break;
      const counts = associationCounts(ancestor);
      if (counts.links === 1 && counts.genericWorkItemCopyControls === 1) return ancestor;
    }

    if (core.workItemIdFromUrl(location.href)) {
      const form = start.closest(FORM_SELECTOR);
      if (form) return form;
    }
    return null;
  }

  function isWorkItemCopyControl(control, container) {
    if (!control || !container) return false;
    const label = core.normalizeWhitespace(attributeValue(control, ["aria-label", "title"]));
    if (!/copy/i.test(label)) return false;

    const counts = associationCounts(container);
    if (/^copy (?:link|title|url)$/i.test(label) && counts.competingLinks) return false;

    if (container.matches(FORM_SELECTOR)) {
      if (!container.matches(FORM_COPY_CONTEXT_SELECTOR)) return false;
      return GENERIC_WORK_ITEM_COPY_LABEL_PATTERN.test(label)
        || (
          /^copy to clipboard$/i.test(label)
          && counts.links === 1
          && counts.copyControls === 1
        );
    }

    if (counts.links !== 1) return false;

    if (container.matches(ITEM_CONTAINER_SELECTOR)) {
      return GENERIC_WORK_ITEM_COPY_LABEL_PATTERN.test(label) || /^copy to clipboard$/i.test(label);
    }

    return counts.genericWorkItemCopyControls === 1 && GENERIC_WORK_ITEM_COPY_LABEL_PATTERN.test(label);
  }

  function titleWithoutWorkItemPrefix(value, id) {
    const normalized = core.normalizeWhitespace(value);
    const escapedId = String(id).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // A bare leading number can be part of the title. Only remove identifiable labels.
    const prefix = new RegExp(
      `^(?:(?:Product Backlog Item|PBI|User Story|US|Test Case|TC|Test Plan|TP|Test Suite|TS|Bug|Task|Feature|Epic|Issue|Work Item)\\s+#?${escapedId}(?=\\s|:|-|$)\\s*(?::|-)?\\s*|#${escapedId}(?=\\s|:|-|$)\\s*(?::|-)?\\s*|${escapedId}\\s*(?::|-)\\s*)`,
      "i"
    );
    return core.normalizeWhitespace(normalized.replace(prefix, ""));
  }

  function extractTitle(container, link, id, fields = listFields(container)) {
    const field = firstMatch(container, TITLE_FIELD_SELECTORS);
    if (field) return elementValue(field);
    const listedTitle = fields.title;
    if (listedTitle) return listedTitle;

    const textElement = firstMatch(container, TITLE_TEXT_SELECTORS);
    if (textElement && textElement !== link) return elementValue(textElement);

    const candidates = [
      ...Array.from(container.querySelectorAll("a[href*='/_workitems/edit/']"), (candidate) => candidate.textContent),
      attributeValue(link, ["title"]),
      attributeValue(link, ["aria-label"]),
      textElement && textElement.textContent,
      attributeValue(textElement, ["title", "aria-label"]),
    ];
    const cleaned = candidates
      .map((candidate) => titleWithoutWorkItemPrefix(candidate, id))
      .filter(Boolean)
      .sort((left, right) => right.length - left.length);
    return cleaned[0] || "";
  }

  function extractType(container, fields = listFields(container)) {
    const typeElement = firstMatch(container, TYPE_SELECTORS);
    const clean = (value) => core.normalizeWhitespace(value).replace(/^Work item type\s*:?\s*/i, "");
    let raw = [elementValue(typeElement), attributeValue(typeElement, ["title"]), typeElement?.textContent,
      attributeValue(container, ["data-work-item-type", "data-item-type"]), fields.type].map(clean).find(Boolean);

    if (!raw) {
      const knownType = Array.from(container.querySelectorAll("[aria-label], [title]")).find((element) => {
        const value = core.normalizeWhitespace(attributeValue(element, ["aria-label", "title"]));
        return /^(Product Backlog Item|PBI|User Story|US|Test Case|TC|Test Plan|TP|Test Suite|TS|Bug|Task|Feature|Epic|Issue)$/i.test(value);
      });
      raw = attributeValue(knownType, ["aria-label", "title"]);
    }

    if (!raw) {
      const workItemLink = container.querySelector("a[href*='/_workitems/edit/']");
      const linkLabel = core.normalizeWhitespace(
        (workItemLink && workItemLink.textContent) || attributeValue(workItemLink, ["aria-label", "title"])
      );
      const match = linkLabel.match(/^(Product Backlog Item|PBI|User Story|US|Test Case|TC|Test Plan|TP|Test Suite|TS|Bug|Task|Feature|Epic|Issue|Work Item)\b/i);
      raw = match && match[1];
    }

    return core.normalizeWhitespace(raw).replace(/^Work item type\s*:?\s*/i, "") || "Work item";
  }

  function extractWorkItem(container, fields = container ? listFields(container) : {}) {
    if (!container) return null;
    const currentUrl = core.safeWorkItemUrl(location.href);
    const link = container.querySelector("a[href*='/_workitems/edit/']");
    const linkHref = link && link.getAttribute("href");
    const linkUrl = linkHref ? core.safeWorkItemUrl(absoluteUrl(linkHref)) : "";
    if (linkHref && !linkUrl) return null;
    const isCurrentItemContainer = container.matches(FORM_SELECTOR) || container === document.body;
    if (isCurrentItemContainer && currentUrl && linkUrl
      && (core.workItemIdFromUrl(currentUrl) !== core.workItemIdFromUrl(linkUrl)
        || !sameOrganization(currentUrl, linkUrl))) return null;
    const url = isCurrentItemContainer && currentUrl ? currentUrl : linkUrl;
    const urlId = core.workItemIdFromUrl(url);
    const explicitId = attributeValue(container, ["data-work-item-id", "data-item-id"]);
    if (!urlId || (explicitId && (!/^\d+$/.test(explicitId) || explicitId !== urlId))) return null;
    const id = urlId;
    const title = extractTitle(container, link, id, fields);

    if (!id || !title) return null;
    return { id, title, type: extractType(container, fields), url };
  }

  function listFields(row, headerCache = new Map()) {
    if (!row.matches(RELEASE_ROW)) return {};
    const gridSelector = RELEASE_SCOPE;
    const grid = row.closest(gridSelector);
    if (!grid) return {};
    const field = (name) => ({ title: "title", systemtitle: "title", type: "type", workitemtype: "type", systemworkitemtype: "type", id: "id", systemid: "id" })[
      core.normalizeWhitespace(name).toLowerCase().replace(/[^a-z]/g, "")];
    if (!headerCache.has(grid)) headerCache.set(grid, Array.from(grid.querySelectorAll("[role='columnheader'],th,.grid-header-column,.bolt-table-header-cell"))
      .filter((header) => header.closest(gridSelector) === grid)
      .map((header, index) => ({ index: header.getAttribute("aria-colindex") || String(index + 1),
        field: field(attributeValue(header, ["data-field", "data-column-name", "data-column-key"]) || header.textContent) })));
    const headers = headerCache.get(grid);
    const fields = {};
    Array.from(row.querySelectorAll("[role='gridcell'],[role='cell'],td,.grid-cell,.bolt-table-cell"))
      .filter((cell) => cell.closest(RELEASE_ROW) === row).forEach((cell, index) => {
        const name = field(attributeValue(cell, ["data-field", "data-column-name", "data-column-key"]))
          || headers.find((header) => header.index === (cell.getAttribute("aria-colindex") || String(index + 1)))?.field;
        if (name) {
          const source = cell.querySelector(RELEASE_ACTIONS) ? cell.cloneNode(true) : cell;
          source.querySelectorAll(RELEASE_ACTIONS).forEach((actions) => actions.remove());
          fields[name] = core.normalizeWhitespace(source.querySelector("input:not([type='checkbox'])")?.value ?? source.textContent);
          if (name === "title") fields.titleCell = cell;
        }
      });
    return fields;
  }

  function isReleasePage() {
    try {
      const url = new URL(location.href);
      return /\/_release(?:Progress)?(?:[/?#]|$)/i.test(url.pathname)
        || /(?:^#|\/)\/?_release(?:Progress)?(?:[/?#]|$)/i.test(url.hash);
    } catch (_) { return false; }
  }

  function releaseKey(item) {
    return `${organization(item.url)}/${item.id}`;
  }

  function releaseRecords(scope) {
    const rows = new Set(scope.querySelectorAll(RELEASE_ROW));
    const headers = new Map();
    for (const link of scope.querySelectorAll("a[href*='/_workitems/edit/']")) {
      if (link.closest(RELEASE_ACTIONS)) continue;
      const row = link.closest(RELEASE_ROW) || link.closest(ITEM_CONTAINER_SELECTOR) || link.parentElement;
      if (row && scope.contains(row)) rows.add(row);
    }
    const records = [];
    for (const row of rows) {
      if (!isVisibleShortcutCandidate(row) || row.closest(FORM_SELECTOR) || isEditableTarget(row)) continue;
      const owner = row.closest(RELEASE_SCOPE);
      if (owner && owner !== scope) continue;
      const links = Array.from(row.querySelectorAll("a[href*='/_workitems/edit/']"))
        .filter((link) => !link.closest(RELEASE_ACTIONS));
      const fields = listFields(row, headers);
      const attributeId = attributeValue(row, ["data-work-item-id", "data-item-id"]);
      if (attributeId && fields.id && attributeId !== fields.id) continue;
      let item;
      if (links.length) {
        const urls = links.map((link) => core.safeWorkItemUrl(absoluteUrl(link.getAttribute("href"))));
        if (urls.some((url) => !url)) continue;
        const keys = new Set(urls.map((url) => releaseKey({ url, id: core.workItemIdFromUrl(url) })));
        if (keys.size !== 1) continue;
        const id = core.workItemIdFromUrl(urls[0]);
        const explicitId = attributeId || fields.id;
        if (explicitId && explicitId !== id) continue;
        const title = extractTitle(row, links[0], id, fields);
        if (!title || (title === id && !fields.title && !firstMatch(row, TITLE_TEXT_SELECTORS))) continue;
        item = { id, title, type: extractType(row, fields), url: urls[0] };
      } else {
        // Release grids can render IDs/titles as clickable cells without anchors.
        const id = attributeId || fields.id;
        const type = fields.type || extractType(row, fields);
        if (!/^\d+$/.test(id || "") || !fields.title || !type || type === "Work item") continue;
        const current = new URL(location.href);
        const prefix = current.pathname.split(/\/_[^/]*(?:\/|$)/)[0];
        const url = core.safeWorkItemUrl(`${current.origin}${prefix}/_workitems/edit/${id}`);
        if (!url) continue;
        item = { id, title: fields.title, type, url };
      }
      records.push({ row, item, key: releaseKey(item), titleCell: fields.titleCell, linked: links.length > 0 });
    }
    return records;
  }

  function removeReleaseEntry(entry) {
    entry.toolbar.remove();
    for (const [row, controls] of entry.rows) {
      controls.actions.remove();
      row.removeAttribute("data-azure-niceties-release-row");
      row.removeAttribute("data-azure-niceties-release-selected");
    }
    entry.rows.clear();
    entry.selected.clear();
  }

  function clearReleaseLists() {
    releaseObserver?.disconnect();
    window.clearTimeout(releaseTimer);
    releaseTimer = null;
    for (const entry of releaseLists.values()) removeReleaseEntry(entry);
    releaseLists.clear();
    releasePrompt?.element.remove();
    releasePrompt = null;
  }

  function showReleasePrompt() {
    if (!document.body) return;
    if (Array.from(document.querySelectorAll(FORM_SELECTOR)).some(isVisibleShortcutCandidate)) {
      releasePrompt?.element.remove(); releasePrompt = null;
      return;
    }
    const host = Array.from(document.querySelectorAll("[role='dialog'],.bolt-panel,.ms-Panel")).find(isVisibleShortcutCandidate) || document.body;
    if (!releasePrompt) {
      const element = document.createElement("aside");
      element.dataset.azureNicetiesReleasePrompt = "true";
      const heading = document.createElement("strong");
      heading.textContent = "Release work-item copying";
      const message = document.createElement("p");
      const enable = document.createElement("button");
      enable.type = "button";
      enable.dataset.azureNicetiesEnableCopying = "true";
      enable.textContent = "Enable copying";
      element.append(heading, message, enable);
      host.append(element);
      releasePrompt = { element, message, enable };
    }
    if (releasePrompt.element.parentElement !== host) host.append(releasePrompt.element);
    const message = enabled
      ? "Open a release stage’s Work items list to select items, copy individual references, or copy the loaded list."
      : "Enable copying to read work-item IDs, titles, types and links locally and copy references when requested. Optional parent context uses your signed-in Azure DevOps session. No work-item data is sent to the developer.";
    if (releasePrompt.message.textContent !== message) releasePrompt.message.textContent = message;
    releasePrompt.enable.hidden = enabled;
  }

  function releaseButton(label, kind) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.dataset.azureNicetiesReleaseCopy = kind;
    button.title = "One linked reference per item. Shift: Markdown; Alt/Option: IDs; Ctrl/Command: URLs; Shift+Alt/Option: branch names.";
    return button;
  }

  function createReleaseEntry(scope) {
    const toolbar = document.createElement("div");
    toolbar.dataset.azureNicetiesReleaseToolbar = "true";
    toolbar.setAttribute("role", "group");
    toolbar.setAttribute("aria-label", "Release work-item copying");
    const label = document.createElement("label");
    const all = document.createElement("input");
    all.type = "checkbox";
    all.setAttribute("aria-label", "Select all loaded work items");
    label.append(all, document.createTextNode("Select loaded items"));
    const selectedButton = releaseButton("Copy selected (0)", "selected");
    const allButton = releaseButton("Copy all loaded", "all");
    allButton.dataset.azureNicetiesCopyList = "true";
    const clear = document.createElement("button");
    clear.type = "button";
    clear.textContent = "Clear selection";
    const hint = document.createElement("small");
    hint.textContent = "Selections stay while this list is open. Copy all covers loaded, visible rows.";
    toolbar.append(label, selectedButton, allButton, clear, hint);
    scope.before(toolbar);
    return { scope, toolbar, all, selectedButton, allButton, clear, selected: new Map(), rows: new Map(), page: location.href };
  }

  function updateReleaseEntry(entry, records) {
    const unique = new Map();
    for (const record of records) if (!unique.has(record.key)) unique.set(record.key, record.item);
    for (const [key, item] of unique) if (entry.selected.has(key)) entry.selected.set(key, item);
    const current = new Set(records.map((record) => record.row));
    for (const [row, controls] of entry.rows) {
      if (!current.has(row)) {
        controls.actions.remove();
        row.removeAttribute("data-azure-niceties-release-row");
        row.removeAttribute("data-azure-niceties-release-selected");
        entry.rows.delete(row);
      }
    }
    for (const record of records) {
      const { row, item, key } = record;
      let controls = entry.rows.get(row);
      if (!controls || !row.contains(controls.actions) || controls.key !== key || controls.linked !== record.linked) {
        controls?.actions.remove();
        row.querySelectorAll(RELEASE_ACTIONS).forEach((cloned) => cloned.remove());
        const actions = document.createElement("span");
        actions.dataset.azureNicetiesReleaseActions = "true";
        actions.setAttribute("role", "group");
        actions.setAttribute("aria-label", "Work-item copying");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.dataset.azureNicetiesReleaseSelect = "true";
        const copy = releaseButton("Copy", "item");
        actions.append(checkbox, copy);
        if (!record.linked) {
          const open = document.createElement("a");
          open.textContent = "Open";
          open.target = "_blank";
          open.rel = "noopener noreferrer";
          actions.append(open);
        }
        (record.titleCell || row.querySelector("[role='gridcell'],[role='cell'],td") || row).prepend(actions);
        controls = { actions, checkbox, copy, key, linked: record.linked };
        entry.rows.set(row, controls);
      }
      const label = core.labelFor(item);
      if (controls.checkbox.getAttribute("aria-label") !== `Select ${label}`) controls.checkbox.setAttribute("aria-label", `Select ${label}`);
      if (controls.copy.getAttribute("aria-label") !== `Copy ${label}`) controls.copy.setAttribute("aria-label", `Copy ${label}`);
      const open = controls.actions.querySelector("a");
      if (open && open.getAttribute("href") !== item.url) open.href = item.url;
      const selected = entry.selected.has(key);
      controls.checkbox.checked = selected;
      if (!row.hasAttribute("data-azure-niceties-release-row")) row.setAttribute("data-azure-niceties-release-row", "true");
      if (row.getAttribute("data-azure-niceties-release-selected") !== String(selected)) row.setAttribute("data-azure-niceties-release-selected", String(selected));
    }
    const keys = new Set(records.map((record) => record.key));
    const selectedLoaded = [...keys].filter((key) => entry.selected.has(key)).length;
    entry.all.checked = keys.size > 0 && selectedLoaded === keys.size;
    entry.all.indeterminate = selectedLoaded > 0 && selectedLoaded < keys.size;
    const allLabel = `Copy all loaded (${keys.size})`;
    const selectedLabel = `Copy selected (${entry.selected.size})`;
    if (entry.allButton.textContent !== allLabel) entry.allButton.textContent = allLabel;
    if (entry.selectedButton.textContent !== selectedLabel) entry.selectedButton.textContent = selectedLabel;
    entry.selectedButton.disabled = entry.selected.size === 0;
    entry.allButton.disabled = keys.size === 0;
    entry.clear.disabled = entry.selected.size === 0;
  }

  function updateReleaseLists() {
    releaseTimer = null;
    if (!isReleasePage()) {
      for (const entry of releaseLists.values()) removeReleaseEntry(entry);
      releaseLists.clear();
      releasePrompt?.element.remove();
      releasePrompt = null;
      return;
    }
    if (!enabled) { showReleasePrompt(); return; }
    const scopes = new Set(document.querySelectorAll(RELEASE_SCOPE));
    const ungrouped = Array.from(document.querySelectorAll("a[href*='/_workitems/edit/']"))
      .filter((link) => !link.closest(`${RELEASE_SCOPE},${FORM_SELECTOR},${RELEASE_ACTIONS}`) && !isEditableTarget(link) && isVisibleShortcutCandidate(link));
    if (ungrouped.length) {
      let common = ungrouped[0].parentElement;
      while (common && !ungrouped.every((link) => common.contains(link))) common = common.parentElement;
      if (common && common !== document.body && common !== document.documentElement) scopes.add(common);
    }
    // A virtualized list can temporarily have no rows, while its container and
    // the user's explicitly selected references still belong to this view.
    for (const [scope, entry] of releaseLists) {
      if (entry.page === location.href && scope.isConnected) scopes.add(scope);
    }
    for (const [scope, entry] of releaseLists) {
      if (!scope.isConnected || !scopes.has(scope)) { removeReleaseEntry(entry); releaseLists.delete(scope); }
    }
    for (const scope of scopes) {
      if (scope.closest(FORM_SELECTOR) || isEditableTarget(scope)) {
        const entry = releaseLists.get(scope);
        if (entry) { removeReleaseEntry(entry); releaseLists.delete(scope); }
        continue;
      }
      if (!isVisibleShortcutCandidate(scope)) {
        const entry = releaseLists.get(scope);
        if (entry) {
          if (entry.page !== location.href) { removeReleaseEntry(entry); releaseLists.delete(scope); }
          else entry.toolbar.hidden = true;
        }
        continue;
      }
      const records = releaseRecords(scope);
      let entry = releaseLists.get(scope);
      if (!records.length && !entry) continue;
      if (!entry) { entry = createReleaseEntry(scope); releaseLists.set(scope, entry); }
      entry.toolbar.hidden = false;
      if (entry.page !== location.href) { entry.selected.clear(); entry.page = location.href; }
      updateReleaseEntry(entry, records);
    }
    if (releaseLists.size) { releasePrompt?.element.remove(); releasePrompt = null; }
    else showReleasePrompt();
  }

  function scheduleReleaseLists() {
    if (releaseTimer == null && (isReleasePage() || releaseLists.size || releasePrompt)) releaseTimer = window.setTimeout(updateReleaseLists, 100);
  }

  function observeReleaseLists() {
    if (!document.documentElement || typeof MutationObserver !== "function") return;
    releaseObserver ||= new MutationObserver((changes) => {
      if (changes.some((change) => !(change.target instanceof Element ? change.target : change.target.parentElement)
        ?.closest("[data-azure-niceties-release-toolbar],[data-azure-niceties-release-prompt],[data-azure-niceties-summary],[data-azure-niceties-release-actions]"))) scheduleReleaseLists();
    });
    releaseObserver.observe(document.documentElement, { childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ["class", "style", "hidden", "aria-hidden", "href", "data-item-id", "data-work-item-id", "data-value"] });
    scheduleReleaseLists();
  }

  function releaseEntryFor(target) {
    if (!(target instanceof Element) || !isReleasePage()) return null;
    return Array.from(releaseLists.values()).find((entry) => entry.page === location.href
      && isVisibleShortcutCandidate(entry.scope)
      && (entry.scope.contains(target) || entry.toolbar.contains(target))) || null;
  }

  async function copyReleaseItems(entry, mode, control, selectedOnly) {
    const requestId = ++latestCopyRequest;
    const page = location.href;
    const records = releaseRecords(entry.scope);
    const chosen = new Map();
    for (const { key, item } of records) {
      if (entry.selected.has(key) && !chosen.has(key)) chosen.set(key, item);
    }
    for (const [key, item] of chosen) entry.selected.set(key, item);
    for (const [key, item] of entry.selected) if (!chosen.has(key)) chosen.set(key, item);
    const items = selectedOnly ? [...chosen.values()] : records.map((record) => record.item);
    const preferences = await settings();
    if (location.href !== page || !entry.scope.isConnected) return;
    const formatted = core.formatWorkItems(items, { mode, branchPrefix: preferences.branchPrefix });
    if (formatted) await copyFormatted(formatted, control, requestId);
  }

  function selectedWorkItem() {
    const activeContainer = findContainer(document.activeElement);
    if (isVisibleShortcutCandidate(activeContainer)) {
      return { container: activeContainer, workItem: extractWorkItem(activeContainer) };
    }

    const selected = Array.from(document.querySelectorAll([
      "[data-work-item-id][aria-selected='true']",
      "[data-item-id][aria-selected='true']",
      "[role='row'][aria-selected='true']",
      ".wit-card.selected",
      ".board-card.selected",
    ].join(","))).find(isVisibleShortcutCandidate) || null;
    if (hoveredContainer && !isVisibleShortcutCandidate(hoveredContainer)) hoveredContainer = null;
    const container = selected || hoveredContainer;
    const extracted = extractWorkItem(container);
    if (extracted) return { container, workItem: extracted };

    if (core.workItemIdFromUrl(location.href)) {
      const forms = Array.from(document.querySelectorAll(FORM_SELECTOR));
      const form = forms.find(isVisibleShortcutCandidate);
      if (form) return { container: form, workItem: extractWorkItem(form) };
      if (forms.length === 0 && isVisibleShortcutCandidate(document.body)) {
        return { container: document.body, workItem: extractWorkItem(document.body) };
      }
    }
    return { container: null, workItem: null };
  }

  async function settings() {
    if (globalThis.azureNicetiesTestSettings) {
      return { ...core.DEFAULT_SETTINGS, ...globalThis.azureNicetiesTestSettings };
    }
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.sync) {
      return chrome.storage.sync.get(core.DEFAULT_SETTINGS);
    }
    return { ...core.DEFAULT_SETTINGS };
  }

  async function reloadConsent() {
    const load = ++consentLoad;
    enabled = false;
    hoveredContainer = null;
    latestCopyRequest += 1;
    for (const controller of activeParentLookups) controller.abort();
    parentCache.clear();
    clearReleaseLists();
    observeReleaseLists();
    if (globalThis.azureNicetiesTestSettings) {
      enabled = globalThis.azureNicetiesTestSettings.dataConsent === true;
      observeReleaseLists();
      return;
    }
    try {
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        const stored = await chrome.storage.local.get({ dataConsent: false });
        if (load === consentLoad) {
          enabled = stored.dataConsent === true;
          observeReleaseLists();
        }
      }
    } catch (_error) {
      // Missing or unavailable consent keeps work-item processing disabled.
    }
  }

  function organization(value) {
    try {
      const url = new URL(value);
      if (url.protocol !== "https:" || url.username || url.password || url.port) return "";
      if (url.hostname === "dev.azure.com") {
        const segment = url.pathname.split("/")[1];
        const name = decodeURIComponent(segment || "");
        return name && !/[\\/]/.test(name) && !name.startsWith("_")
          ? `${url.origin}/${name.toLowerCase()}` : "";
      }
      return /^[a-z0-9-]+\.visualstudio\.com$/i.test(url.hostname) ? url.origin : "";
    } catch (_error) {
      return "";
    }
  }

  function sameOrganization(left, right) {
    const leftOrganization = organization(left);
    return Boolean(leftOrganization && leftOrganization === organization(right)
      && new URL(left).origin === new URL(right).origin);
  }

  function parentApiUrl(relationUrl, childUrl) {
    try {
      const url = new URL(relationUrl, childUrl);
      if (!sameOrganization(url.href, childUrl)) return "";
      const match = url.pathname.match(/^(.*?)\/_apis\/wit\/workitems\/(\d+)\/?$/i);
      if (!match || /\/_apis(?:\/|$)/i.test(match[1])) return "";
      const prefixSegments = match[1].split("/").filter(Boolean);
      const minimum = url.hostname === "dev.azure.com" ? 1 : 0;
      if (prefixSegments.length < minimum || prefixSegments.length > minimum + 2) return "";
      url.search = "";
      url.hash = "";
      url.searchParams.set("fields", "System.Id,System.Title,System.WorkItemType");
      url.searchParams.set("api-version", "7.1");
      return url.href;
    } catch (_error) {
      return "";
    }
  }

  function parentCacheKey(workItem) {
    if (!workItem.url) return `id:${workItem.id}`;
    try {
      const url = new URL(workItem.url, location.href);
      url.hash = "";
      url.search = "";
      return url.href;
    } catch (_error) {
      return workItem.url;
    }
  }

  async function fetchParent(workItem) {
    if (!enabled) return null;
    const cacheKey = parentCacheKey(workItem);
    const cached = parentCache.get(cacheKey);
    if (cached?.promise) return cached.promise;
    if (cached?.expiresAt > Date.now()) return cached.value;
    if (cached) parentCache.delete(cacheKey);

    const controller = new AbortController();
    const consentVersion = consentLoad;
    const isActive = () => enabled && consentVersion === consentLoad && !controller.signal.aborted;
    activeParentLookups.add(controller);
    // Resolve cancellation even when a fetch implementation ignores abort.
    const cancelled = new Promise((resolve) => {
      controller.signal.addEventListener("abort", () => resolve(null), { once: true });
    });
    const deadline = window.setTimeout(() => controller.abort(), PARENT_LOOKUP_TIMEOUT_MS);
    const lookup = (async () => {
      try {
        const childUrl = core.safeWorkItemUrl(workItem.url);
        if (!childUrl || !/^\d+$/.test(String(workItem.id))
          || core.workItemIdFromUrl(childUrl) !== String(workItem.id)
          || !sameOrganization(childUrl, location.href)) return null;
        const itemUrl = new URL(childUrl);
        const marker = itemUrl.pathname.toLowerCase().indexOf("/_workitems/edit/");
        itemUrl.pathname = `${itemUrl.pathname.slice(0, marker)}/_apis/wit/workitems/${workItem.id}`;
        itemUrl.search = "?$expand=relations&fields=System.Id&api-version=7.1";
        itemUrl.hash = "";
        const requestOptions = { credentials: "include", redirect: "error", signal: controller.signal };
        const childResponse = await fetch(itemUrl.href, requestOptions);
        if (!isActive()) return null;
        if (!childResponse.ok || childResponse.redirected) return null;
        if (childResponse.url
          && parentApiUrl(childResponse.url, childUrl) !== parentApiUrl(itemUrl.href, childUrl)) return null;
        const child = await childResponse.json();
        if (!isActive()) return null;
        if (child.id != null && String(child.id) !== String(workItem.id)) return null;
        const relation = Array.isArray(child.relations) && child.relations.find((candidate) =>
          candidate.rel === "System.LinkTypes.Hierarchy-Reverse" || candidate.attributes?.name === "Parent"
        );
        if (!relation) return null;
        const relationApiUrl = parentApiUrl(relation.url, childUrl);
        if (!relationApiUrl) return null;
        const expectedId = new URL(relationApiUrl).pathname.match(/\/(\d+)\/?$/)[1];
        const response = await fetch(relationApiUrl, requestOptions);
        if (!isActive()) return null;
        if (!response.ok || response.redirected) return null;
        if (response.url && parentApiUrl(response.url, childUrl) !== relationApiUrl) return null;
        const parent = await response.json();
        if (!isActive()) return null;
        const fields = parent.fields || {};
        const id = String(parent.id ?? fields["System.Id"] ?? "");
        if (!/^\d+$/.test(id) || id !== expectedId
          || (fields["System.Id"] != null && String(fields["System.Id"]) !== id)
          || !core.normalizeWhitespace(fields["System.Title"])) return null;
        const htmlUrl = core.safeWorkItemUrl(parent._links?.html?.href);
        const safeUrl = htmlUrl && sameOrganization(htmlUrl, childUrl)
          && core.workItemIdFromUrl(htmlUrl) === id ? htmlUrl : childUrl.replace(
            /\/_workitems\/edit\/\d+\/?(?=[?#]|$)/i, `/_workitems/edit/${id}`
          );
        return { id, title: fields["System.Title"], type: fields["System.WorkItemType"] || "Work item", url: safeUrl };
      } catch (error) {
        console.debug("Azure DevOps Niceties could not load parent context.", error);
        return null;
      }
    })();
    const request = Promise.race([lookup, cancelled]).finally(() => {
      window.clearTimeout(deadline);
      activeParentLookups.delete(controller);
    });

    const entry = { promise: request };
    parentCache.set(cacheKey, entry);
    const parent = await request;
    if (parent && isActive() && parentCache.get(cacheKey) === entry) {
      parentCache.set(cacheKey, {
        value: parent,
        expiresAt: Date.now() + PARENT_CACHE_TTL_MS,
      });
    } else if (parentCache.get(cacheKey) === entry) {
      parentCache.delete(cacheKey);
    }
    return isActive() ? parent : null;
  }

  function writeClipboard(formatted) {
    let populated = false;
    const copy = (event) => {
      if (!event.clipboardData) return;
      event.clipboardData.setData("text/plain", formatted.plainText);
      if (formatted.rich) event.clipboardData.setData("text/html", formatted.html);
      event.preventDefault();
      event.stopImmediatePropagation();
      populated = true;
    };
    document.addEventListener("copy", copy, true);
    try {
      // Complete the write in this event turn. An asynchronous clipboard write
      // could finish after a newer native text copy and replace its contents.
      if (!document.execCommand("copy") || !populated) throw new Error("Clipboard write was denied");
    } finally {
      document.removeEventListener("copy", copy, true);
    }
  }

  function confirmationStatus() {
    let status = document.querySelector("[data-azure-niceties-status]");
    if (!(status instanceof HTMLElement)) {
      const host = document.body || document.documentElement;
      if (!host) return null;
      status = document.createElement("span");
      status.dataset.azureNicetiesStatus = "true";
      status.setAttribute("role", "status");
      status.setAttribute("aria-live", "polite");
      status.setAttribute("aria-atomic", "true");
      host.append(status);
    }
    return status;
  }

  function showConfirmation(control, label) {
    if (control instanceof HTMLElement) {
      window.clearTimeout(confirmationTimers.get(control));
      control.dataset.azureNicetiesCopied = "true";
      control.dataset.azureNicetiesCopiedLabel = label;
      confirmationTimers.set(control, window.setTimeout(() => {
        delete control.dataset.azureNicetiesCopied;
        delete control.dataset.azureNicetiesCopiedLabel;
        confirmationTimers.delete(control);
      }, 1200));
    }

    const status = confirmationStatus();
    if (status) {
      status.textContent = "";
      window.requestAnimationFrame(() => {
        if (status.isConnected) status.textContent = `Copied ${label}`;
      });
    }
  }

  async function copyWorkItem(workItem, mode, control, requestId) {
    const preferences = await settings();
    if (!enabled || requestId !== latestCopyRequest) return;
    const parent = preferences.includeParent && (mode === "rich" || mode === "markdown")
      ? await fetchParent(workItem)
      : null;
    if (!enabled || requestId !== latestCopyRequest) return;
    const formatted = core.formatWorkItem(workItem, {
      mode,
      parent,
      branchPrefix: preferences.branchPrefix,
    });
    return copyFormatted(formatted, control, requestId);
  }

  async function copyFormatted(formatted, control, requestId) {
    if (!enabled || requestId !== latestCopyRequest) return;

    const write = clipboardWriteQueue.then(async () => {
      if (!enabled || requestId !== latestCopyRequest) return false;
      clipboardWriteInProgress = true;
      try {
        let clipboardWrite;
        invokingExtensionClipboardWrite = true;
        try {
          clipboardWrite = writeClipboard(formatted);
        } finally {
          invokingExtensionClipboardWrite = false;
        }
        await clipboardWrite;
        return true;
      } finally {
        clipboardWriteInProgress = false;
      }
    });
    clipboardWriteQueue = write.catch(() => {});
    const wrote = await write;
    if (wrote && requestId === latestCopyRequest) showConfirmation(control, formatted.label);
  }

  function enhanceCopyControl(control) {
    if (!(control instanceof HTMLElement) || control.dataset.azureNicetiesEnhanced) return;
    control.dataset.azureNicetiesEnhanced = "true";
  }

  function confirmationControlFor(container) {
    if (!(container instanceof Element)) return null;
    return Array.from(container.querySelectorAll(COPY_CONTROL_SELECTOR)).find((control) =>
      isWorkItemCopyControl(control, findContainer(control))
    ) || null;
  }

  function restoreNativeCopy(control) {
    if (!(control instanceof HTMLElement) || !control.isConnected) return;
    nativeFallbackControls.add(control);
    control.click();
  }

  function replayNativeCopyAfterWrites(control, requestId) {
    clipboardWriteQueue.then(() => {
      if (requestId === latestCopyRequest) restoreNativeCopy(control);
    });
  }

  function markNativeCopyClickInProgress() {
    nativeCopyClickInProgress = true;
    window.setTimeout(() => { nativeCopyClickInProgress = false; }, 0);
  }

  function isVisibleShortcutCandidate(container) {
    if (!(container instanceof Element) || !container.isConnected) return false;
    if (container.closest("[hidden], [aria-hidden='true']")) return false;
    if (typeof container.checkVisibility === "function") {
      return container.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
    }
    const style = window.getComputedStyle(container);
    return style.display !== "none"
      && style.visibility !== "hidden"
      && style.visibility !== "collapse"
      && style.opacity !== "0"
      && container.getClientRects().length > 0;
  }

  function isEditableTarget(target) {
    return target instanceof Element && Boolean(target.closest([
      "input",
      "textarea",
      "select",
      "[contenteditable]:not([contenteditable='false'])",
      "[role='textbox']",
      "[role='combobox']",
    ].join(",")));
  }

  if (!confirmationStatus()) {
    document.addEventListener("DOMContentLoaded", () => { confirmationStatus(); }, { once: true });
  }

  document.addEventListener("copy", function () {
    if (!invokingExtensionClipboardWrite && !nativeCopyClickInProgress) latestCopyRequest += 1;
  }, true);

  reloadConsent();
  if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && Object.prototype.hasOwnProperty.call(changes, "dataConsent")) reloadConsent();
    });
  }

  document.addEventListener("pointerover", function (event) {
    if (!enabled || !event.isTrusted) return;
    if (!(event.target instanceof Element)) return;
    const container = findContainer(event.target);
    if (container) hoveredContainer = container;
    const control = event.target.closest(COPY_CONTROL_SELECTOR);
    if (control && isWorkItemCopyControl(control, findContainer(control))) enhanceCopyControl(control);
  }, true);

  document.addEventListener("click", function (event) {
    if (event.isTrusted && releasePrompt && event.target instanceof Element
      && event.target.closest("[data-azure-niceties-enable-copying]") === releasePrompt.enable) {
      event.preventDefault(); event.stopImmediatePropagation();
      const prompt = releasePrompt;
      prompt.enable.disabled = true;
      chrome.storage.local.set({ dataConsent: true }).then(reloadConsent).catch(() => {
        if (releasePrompt === prompt) {
          prompt.enable.disabled = false;
          prompt.message.textContent = "Could not enable copying. Open the extension menu and try again.";
        }
      });
      return;
    }

    if (!enabled || !event.isTrusted) {
      // Native fallback clicks must still reach Azure DevOps after a failed copy.
      if (event.target instanceof Element) {
        const fallback = event.target.closest(COPY_CONTROL_SELECTOR);
        if (fallback && nativeFallbackControls.has(fallback)) nativeFallbackControls.delete(fallback);
      }
      return;
    }
    const entry = releaseEntryFor(event.target);
    if (entry) {
      const open = event.target.closest("a");
      if (open && Array.from(entry.rows.values()).some((row) => row.actions.querySelector("a") === open)) {
        event.stopImmediatePropagation();
        return;
      }
      const checkbox = event.target.closest("input");
      if (checkbox === entry.all || Array.from(entry.rows.values()).some((row) => row.checkbox === checkbox)) {
        event.stopImmediatePropagation();
        return;
      }
      const clicked = event.target.closest("button");
      if (clicked === entry.clear) {
        event.preventDefault(); event.stopImmediatePropagation();
        entry.selected.clear();
        updateReleaseEntry(entry, releaseRecords(entry.scope));
        return;
      }
      if (clicked === entry.allButton || clicked === entry.selectedButton) {
        event.preventDefault(); event.stopImmediatePropagation();
        copyReleaseItems(entry, core.modeFromModifiers(event), clicked, clicked === entry.selectedButton).catch(() => {
          const status = confirmationStatus();
          if (status) status.textContent = "Could not copy work items. Try again.";
        });
        return;
      }
      const ownedRow = Array.from(entry.rows).find(([, controls]) => controls.copy === clicked);
      if (ownedRow) {
        event.preventDefault(); event.stopImmediatePropagation();
        const record = releaseRecords(entry.scope).find(({ row }) => row === ownedRow[0]);
        if (record) copyWorkItem(record.item, core.modeFromModifiers(event), clicked, ++latestCopyRequest).catch(() => {
          const status = confirmationStatus();
          if (status) status.textContent = "Could not copy this work item. Try again.";
        });
        return;
      }
    }
    const control = event.target instanceof Element && event.target.closest(COPY_CONTROL_SELECTOR);
    if (!control) return;
    if (nativeFallbackControls.has(control)) {
      nativeFallbackControls.delete(control);
      return;
    }
    if (!enabled || !event.isTrusted) return;
    const requestId = ++latestCopyRequest;
    const container = findContainer(control);
    const workItem = isWorkItemCopyControl(control, container) && extractWorkItem(container);
    if (!workItem) {
      markNativeCopyClickInProgress();
      if (clipboardWriteInProgress) replayNativeCopyAfterWrites(control, requestId);
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    const mode = core.modeFromModifiers(event);
    copyWorkItem(workItem, mode, control, requestId).catch((error) => {
      console.warn("Azure DevOps Niceties could not write to the clipboard.", error);
      replayNativeCopyAfterWrites(control, requestId);
    });
  }, true);

  document.addEventListener("change", function (event) {
    if (!enabled || !event.isTrusted || !isReleasePage()) return;
    const entry = releaseEntryFor(event.target);
    if (!entry) return;
    const records = releaseRecords(entry.scope);
    if (event.target === entry.all) {
      event.stopImmediatePropagation();
      for (const record of records) {
        if (entry.all.checked) entry.selected.set(record.key, record.item);
        else entry.selected.delete(record.key);
      }
    } else {
      const ownedRow = Array.from(entry.rows).find(([, controls]) => controls.checkbox === event.target);
      if (!ownedRow) return;
      event.stopImmediatePropagation();
      const record = records.find(({ row }) => row === ownedRow[0]);
      if (!record) return;
      if (event.target.checked) entry.selected.set(record.key, record.item);
      else entry.selected.delete(record.key);
    }
    updateReleaseEntry(entry, records);
  }, true);

  document.addEventListener("keydown", function (event) {
    if (!enabled || !event.isTrusted) return;
    const focusedReleaseEntry = releaseEntryFor(event.target);
    const ownSelection = focusedReleaseEntry && (event.target === focusedReleaseEntry.all
      || Array.from(focusedReleaseEntry.rows.values()).some((controls) => controls.checkbox === event.target));
    const extensionShortcut = event.code === "KeyC" && event.shiftKey && event.altKey;
    const selectedShortcut = extensionShortcut || (event.code === "KeyC" && (event.ctrlKey || event.metaKey)
      && !event.shiftKey && !event.altKey && (ownSelection || event.target === focusedReleaseEntry?.selectedButton));
    const releaseEntry = focusedReleaseEntry || (extensionShortcut ? releaseEntryFor(hoveredContainer) : null);
    if (releaseEntry?.selected.size && selectedShortcut && !event.isComposing
      && !event.target.closest?.(FORM_SELECTOR)
      && (!isEditableTarget(event.target) || ownSelection) && !window.getSelection?.().toString()) {
      event.preventDefault(); event.stopImmediatePropagation();
      copyReleaseItems(releaseEntry, "rich", releaseEntry.selectedButton, true).catch(() => {});
      return;
    }
    if (!event.shiftKey || !event.altKey || (event.code !== "KeyC" && event.code !== "KeyB")) return;
    if (event.isComposing || isEditableTarget(event.target)) return;
    const { container, workItem } = selectedWorkItem();
    if (!workItem) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    const mode = event.code === "KeyB" ? "branch" : "rich";
    const requestId = ++latestCopyRequest;
    copyWorkItem(workItem, mode, confirmationControlFor(container), requestId).catch((error) => {
      console.warn("Azure DevOps Niceties could not write to the clipboard.", error);
    });
  }, true);
  document.addEventListener("DOMContentLoaded", observeReleaseLists);
  document.addEventListener("readystatechange", observeReleaseLists);
  window.addEventListener("popstate", scheduleReleaseLists);
  window.addEventListener("hashchange", scheduleReleaseLists);
})();
