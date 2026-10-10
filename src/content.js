(function () {
  "use strict";

  const core = globalThis.AzureNicetiesWorkItem;
  const parentCache = new Map();
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
      `^(?:(?:Product Backlog Item|PBI|User Story|Bug|Task|Feature|Epic|Issue|Work Item)\\s+#?${escapedId}(?=\\s|:|-|$)\\s*(?::|-)?\\s*|#${escapedId}(?=\\s|:|-|$)\\s*(?::|-)?\\s*|${escapedId}\\s*(?::|-)\\s*)`,
      "i"
    );
    return core.normalizeWhitespace(normalized.replace(prefix, ""));
  }

  function extractTitle(container, link, id) {
    const field = firstMatch(container, TITLE_FIELD_SELECTORS);
    if (field) return elementValue(field);

    const textElement = firstMatch(container, TITLE_TEXT_SELECTORS);
    if (textElement && textElement !== link) return elementValue(textElement);

    const candidates = [
      link && link.textContent,
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

  function extractType(container) {
    const typeElement = firstMatch(container, TYPE_SELECTORS);
    let raw = elementValue(typeElement)
      || attributeValue(container, ["data-work-item-type", "data-item-type"]);

    if (!raw) {
      const knownType = Array.from(container.querySelectorAll("[aria-label], [title]")).find((element) => {
        const value = core.normalizeWhitespace(attributeValue(element, ["aria-label", "title"]));
        return /^(Product Backlog Item|User Story|Bug|Task|Feature|Epic|Issue)$/i.test(value);
      });
      raw = attributeValue(knownType, ["aria-label", "title"]);
    }

    if (!raw) {
      const workItemLink = container.querySelector("a[href*='/_workitems/edit/']");
      const linkLabel = core.normalizeWhitespace(
        (workItemLink && workItemLink.textContent) || attributeValue(workItemLink, ["aria-label", "title"])
      );
      const match = linkLabel.match(/^(Product Backlog Item|PBI|User Story|Bug|Task|Feature|Epic|Issue|Work Item)\b/i);
      raw = match && match[1];
    }

    return core.normalizeWhitespace(raw).replace(/^Work item type\s*:?\s*/i, "") || "Work item";
  }

  function extractWorkItem(container) {
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
    const title = extractTitle(container, link, id);

    if (!id || !title) return null;
    return { id, title, type: extractType(container), url };
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
    if (globalThis.azureNicetiesTestSettings) {
      enabled = globalThis.azureNicetiesTestSettings.dataConsent === true;
      return;
    }
    try {
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        const stored = await chrome.storage.local.get({ dataConsent: false });
        if (load === consentLoad) enabled = stored.dataConsent === true;
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
    const cacheKey = parentCacheKey(workItem);
    const cached = parentCache.get(cacheKey);
    if (cached?.promise) return cached.promise;
    if (cached?.expiresAt > Date.now()) return cached.value;
    if (cached) parentCache.delete(cacheKey);

    const controller = new AbortController();
    let deadline;
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
        if (!childResponse.ok || childResponse.redirected) return null;
        if (childResponse.url
          && parentApiUrl(childResponse.url, childUrl) !== parentApiUrl(itemUrl.href, childUrl)) return null;
        const child = await childResponse.json();
        if (child.id != null && String(child.id) !== String(workItem.id)) return null;
        const relation = Array.isArray(child.relations) && child.relations.find((candidate) =>
          candidate.rel === "System.LinkTypes.Hierarchy-Reverse" || candidate.attributes?.name === "Parent"
        );
        if (!relation) return null;
        const relationApiUrl = parentApiUrl(relation.url, childUrl);
        if (!relationApiUrl) return null;
        const expectedId = new URL(relationApiUrl).pathname.match(/\/(\d+)\/?$/)[1];
        const response = await fetch(relationApiUrl, requestOptions);
        if (!response.ok || response.redirected) return null;
        if (response.url && parentApiUrl(response.url, childUrl) !== relationApiUrl) return null;
        const parent = await response.json();
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
    // Race the whole lookup, including JSON parsing: not all fetch implementations honor abort.
    const timeout = new Promise((resolve) => {
      deadline = window.setTimeout(() => {
        controller.abort();
        resolve(null);
      }, PARENT_LOOKUP_TIMEOUT_MS);
    });
    const request = Promise.race([lookup, timeout]).finally(() => window.clearTimeout(deadline));

    const entry = { promise: request };
    parentCache.set(cacheKey, entry);
    const parent = await request;
    if (parent) {
      parentCache.set(cacheKey, {
        value: parent,
        expiresAt: Date.now() + PARENT_CACHE_TTL_MS,
      });
    } else if (parentCache.get(cacheKey) === entry) {
      parentCache.delete(cacheKey);
    }
    return parent;
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
    const formatted = core.formatWorkItem(workItem, {
      mode,
      parent,
      branchPrefix: preferences.branchPrefix,
    });
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
    if (typeof container.checkVisibility === "function") {
      return container.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
    }
    if (container.closest("[hidden], [aria-hidden='true']")) return false;
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

  document.addEventListener("keydown", function (event) {
    if (!enabled || !event.isTrusted) return;
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
})();
