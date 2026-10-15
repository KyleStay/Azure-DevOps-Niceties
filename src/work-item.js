(function (root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.AzureNicetiesWorkItem = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const WORK_ITEM_URL_PATTERN = /\/_workitems\/edit\/(\d+)(?:[/?#]|$)/i;
  const DEFAULT_SETTINGS = Object.freeze({
    includeParent: false,
    branchPrefix: "feature",
    syncSystemTheme: "auto",
  });

  function normalizeWhitespace(value) {
    return String(value ?? "").replace(/[\s\u0085]+/g, " ").trim();
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function workItemIdFromUrl(value) {
    const match = String(value || "").match(WORK_ITEM_URL_PATTERN);
    return match ? match[1] : "";
  }

  function safeWorkItemUrl(value) {
    try {
      const url = new URL(String(value || ""));
      if (url.protocol !== "https:" || url.username || url.password || url.port) return "";
      if (!/\/_workitems\/edit\/\d+$/i.test(url.pathname)) return "";

      if (url.hostname === "dev.azure.com") {
        const organization = decodeURIComponent(url.pathname.split("/")[1] || "");
        if (!organization || organization.startsWith("_") || /[\/\\]/.test(organization)) return "";
      } else if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.visualstudio\.com$/i.test(url.hostname)) {
        return "";
      }

      return url.href;
    } catch (_) {
      return "";
    }
  }

  function shortType(typeName) {
    const normalized = normalizeWhitespace(typeName).toLowerCase();
    const abbreviations = { "product backlog item": "PBI", "product backlog items": "PBI",
      "user story": "US", "user stories": "US", "test case": "TC", "test cases": "TC",
      "test plan": "TP", "test plans": "TP", "test suite": "TS", "test suites": "TS" };
    if (Object.hasOwn(abbreviations, normalized)) return abbreviations[normalized];
    return normalizeWhitespace(typeName) || "Work item";
  }

  function labelFor(workItem) {
    return `${shortType(workItem.type)} ${normalizeWhitespace(workItem.id)}: ${normalizeWhitespace(workItem.title)}`;
  }

  function linkedHtml(workItem) {
    const label = labelFor(workItem);
    const url = safeWorkItemUrl(workItem.url);
    return url
      ? `<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>`
      : escapeHtml(label);
  }

  function markdownLink(workItem) {
    const label = labelFor(workItem)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/([\\`*_{}\[\]()!|])/g, "\\$1");
    const url = safeWorkItemUrl(workItem.url).replace(/([\\()])/g, "\\$1");
    return url ? `[${label}](${url})` : label;
  }

  function slugify(value, maxLength = 60) {
    return normalizeWhitespace(value)
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, maxLength)
      .replace(/-+$/g, "");
  }

  function branchName(workItem, prefix) {
    const safePrefix = slugify(prefix || DEFAULT_SETTINGS.branchPrefix, 30) || DEFAULT_SETTINGS.branchPrefix;
    const title = slugify(workItem.title) || "work-item";
    return `${safePrefix}/${workItem.id}-${title}`;
  }

  function modeFromModifiers(modifiers) {
    if (modifiers.shiftKey && modifiers.altKey) return "branch";
    if (modifiers.shiftKey) return "markdown";
    if (modifiers.altKey) return "id";
    if (modifiers.metaKey || modifiers.ctrlKey) return "url";
    return "rich";
  }

  function formatWorkItem(workItem, options = {}) {
    const mode = options.mode || "rich";
    const parent = options.parent || null;
    let plainText;
    if (mode === "markdown") {
      plainText = parent
        ? `${markdownLink(parent)} › ${markdownLink(workItem)}`
        : markdownLink(workItem);
    } else if (mode === "id") {
      plainText = `#${normalizeWhitespace(workItem.id)}`;
    } else if (mode === "url") {
      plainText = safeWorkItemUrl(workItem.url);
    } else if (mode === "branch") {
      plainText = branchName(workItem, options.branchPrefix);
    } else {
      const label = parent ? `${labelFor(parent)} › ${labelFor(workItem)}` : labelFor(workItem);
      return {
        mode: "rich",
        label,
        plainText: label,
        html: parent ? `${linkedHtml(parent)} &rsaquo; ${linkedHtml(workItem)}` : linkedHtml(workItem),
        rich: true,
      };
    }
    plainText = normalizeWhitespace(plainText);
    return { mode, label: plainText, plainText, html: escapeHtml(plainText), rich: false };
  }

  function formatWorkItems(items, options = {}) {
    const unique = new Map();
    for (const item of items) {
      const url = safeWorkItemUrl(item.url);
      const id = normalizeWhitespace(item.id);
      if (!url || workItemIdFromUrl(url) !== id || !normalizeWhitespace(item.title)) continue;
      const parsed = new URL(url);
      const org = parsed.hostname === "dev.azure.com" ? parsed.pathname.split("/")[1].toLowerCase() : "";
      const key = `${parsed.origin}/${org}/${id}`;
      if (!unique.has(key)) unique.set(key, { ...item, id, url });
    }
    const formatted = [...unique.values()].map((item) => formatWorkItem(item, options));
    if (!formatted.length) return null;
    return { mode: options.mode || "rich", rich: formatted[0].rich, label: `${formatted.length} work items`,
      count: formatted.length, plainText: formatted.map((item) => item.plainText).join("\n"),
      html: formatted.map((item) => item.html).join("<br>") };
  }

  function releaseCategories(payload) {
    if (!Array.isArray(payload?.value)) return null;
    const names = (referenceName) => {
      const category = payload.value.find((category) => category?.referenceName === referenceName);
      return Array.isArray(category?.workItemTypes)
        ? category.workItemTypes.map((type) => typeof type?.name === "string" ? normalizeWhitespace(type.name) : "").filter(Boolean)
        : [];
    };
    const backlog = names("Microsoft.RequirementCategory");
    return backlog.length ? { backlog, bugs: names("Microsoft.BugCategory") } : null;
  }

  function filterReleaseItems(items, kind, categories) {
    if (kind !== "backlog" && kind !== "bugs-and-backlog") return items;
    if (!categories) return [];
    const types = new Set([...categories.backlog, ...(kind === "bugs-and-backlog" ? categories.bugs : [])]
      .map((type) => shortType(type).toLowerCase()));
    return items.filter((item) => types.has(shortType(item.type).toLowerCase()));
  }

  return {
    DEFAULT_SETTINGS,
    branchName,
    escapeHtml,
    formatWorkItem,
    formatWorkItems,
    filterReleaseItems,
    labelFor,
    modeFromModifiers,
    normalizeWhitespace,
    safeWorkItemUrl,
    releaseCategories,
    shortType,
    slugify,
    workItemIdFromUrl,
  };
});
