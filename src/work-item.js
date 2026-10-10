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
  });

  function normalizeWhitespace(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
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
    if (normalized === "product backlog item" || normalized === "product backlog items") {
      return "PBI";
    }
    return normalizeWhitespace(typeName) || "Work item";
  }

  function labelFor(workItem) {
    return `${shortType(workItem.type)} ${workItem.id}: ${normalizeWhitespace(workItem.title)}`;
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
      plainText = `#${workItem.id}`;
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
    return { mode, label: plainText, plainText, html: escapeHtml(plainText), rich: false };
  }

  return {
    DEFAULT_SETTINGS,
    branchName,
    escapeHtml,
    formatWorkItem,
    labelFor,
    modeFromModifiers,
    normalizeWhitespace,
    safeWorkItemUrl,
    shortType,
    slugify,
    workItemIdFromUrl,
  };
});
