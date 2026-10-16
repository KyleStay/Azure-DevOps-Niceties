(function (root, factory) {
  const core = root.AzureNicetiesWorkItem || (typeof require === "function" ? require("./work-item.js") : null);
  const api = root.AzureNicetiesStateClient || (typeof require === "function" ? require("./state-client.js") : null);
  const table = factory(core, api);
  if (typeof module === "object" && module.exports) module.exports = table;
  root.AzureNicetiesReleaseTable = table;
})(typeof globalThis !== "undefined" ? globalThis : this, function (core, api) {
  "use strict";

  const validReference = value => typeof value === "string" && /^[A-Za-z_][A-Za-z0-9_.-]{0,254}$/.test(value);

  function resolveField(fields, value) {
    const query = core.normalizeWhitespace(value).toLowerCase();
    const reference = fields.find(field => field.referenceName.toLowerCase() === query);
    const matches = reference ? [reference] : fields.filter(field => field.name.toLowerCase() === query);
    if (matches.length !== 1) throw new Error("Choose a field from the suggestions, or enter its exact reference name.");
    return matches[0];
  }

  function cellText(value, field, htmlToText) {
    if (value == null) return "";
    if (typeof value === "object") {
      if (typeof value.displayName === "string") value = value.displayName;
      else throw new Error(`The ${field.name} field contains an unsupported value.`);
    }
    if (!["string", "number", "boolean"].includes(typeof value)) throw new Error("Unsupported field value.");
    const numeric = typeof value === "number" && Number.isFinite(value);
    let text = String(value);
    if (field.type === "html") text = htmlToText(text);
    // Every field occupies one cell, including rich text and multiline titles.
    text = core.normalizeWhitespace(text).replace(/[\u0000-\u0008\u000e-\u001f\u007f]/g, "");
    // Keep work-item strings as text rather than spreadsheet formulas.
    return !numeric && /^[=+\-@]/.test(text) ? `'${text}` : text;
  }

  function formatTable(rows, field, htmlToText = value => value) {
    if (!rows.length) throw new Error("There are no work items to copy.");
    const title = { name: "Title", type: "string" }, state = { name: "State", type: "string" };
    const headers = ["Title", "State", cellText(field.name, title, htmlToText)];
    const cells = rows.map(row => [cellText(row.title, title, htmlToText), cellText(row.state, state, htmlToText), cellText(row.value, field, htmlToText)]);
    const render = (values, tag) => `<tr>${values.map(value => `<${tag}>${core.escapeHtml(value)}</${tag}>`).join("")}</tr>`;
    return { rich: true, mode: "table", label: `${rows.length} work items as a table`, count: rows.length,
      plainText: [headers, ...cells].map(values => values.join("\t")).join("\r\n"),
      html: `<table><thead>${render(headers, "th")}</thead><tbody>${cells.map(values => render(values, "td")).join("")}</tbody></table>` };
  }

  class ReleaseTableClient {
    constructor({ pageUrl, fetch: request = globalThis.fetch, timeout = 10_000 } = {}) {
      this.pageUrl = pageUrl;
      this.organization = api.organizationUrl(pageUrl);
      this.fetch = request.bind(globalThis);
      this.timeout = timeout;
      this.controllers = new Set();
      this.catalog = null;
      this.closed = false;
    }

    close() {
      this.closed = true;
      for (const controller of this.controllers) controller.abort();
      this.catalog = null;
    }

    async run(task) {
      if (this.closed || !this.organization) throw new Error("This release list is no longer available.");
      const controller = new AbortController();
      this.controllers.add(controller);
      const cancelled = new Promise((_, reject) => controller.signal.addEventListener("abort", () => reject(new Error("Table lookup cancelled or timed out. Try again.")), { once: true }));
      const deadline = setTimeout(() => controller.abort(), this.timeout);
      try { return await Promise.race([cancelled, task(controller.signal)]); }
      finally { clearTimeout(deadline); this.controllers.delete(controller); }
    }

    async get(path, signal) {
      if (this.closed || signal.aborted) throw new Error("Table lookup cancelled.");
      const url = `${this.organization}/_apis/wit/${path}`;
      const response = await this.fetch(url, { method: "GET", credentials: "include", redirect: "error", signal, headers: { Accept: "application/json" } });
      if (response.redirected || (response.url && response.url !== url)) throw new Error("Azure DevOps redirected the table lookup. Refresh the page and try again.");
      if (!response.ok) throw new Error("Could not read the table fields. Check your Azure DevOps access and try again.");
      const body = await response.json();
      if (this.closed || signal.aborted) throw new Error("Table lookup cancelled.");
      if (!Array.isArray(body?.value)) throw new Error("Azure DevOps returned an unreadable table response.");
      return body.value;
    }

    async fields() {
      if (this.closed) throw new Error("This release list is no longer available.");
      if (this.catalog) return this.catalog;
      return this.run(async signal => {
        const values = await this.get("fields?api-version=7.1", signal);
        const fields = new Map();
        for (const field of values) {
          if (!validReference(field?.referenceName) || typeof field.name !== "string" || !field.name.trim()
            || ["System.Title", "System.State"].includes(field.referenceName)) continue;
          fields.set(field.referenceName, { name: core.normalizeWhitespace(field.name), referenceName: field.referenceName, type: field.type });
        }
        const catalog = [...fields.values()].sort((a, b) => a.name.localeCompare(b.name) || a.referenceName.localeCompare(b.referenceName));
        if (!catalog.length) throw new Error("No additional work-item fields are available.");
        this.catalog = catalog;
        return catalog;
      });
    }

    async read(items, field) {
      if (!validReference(field?.referenceName) || !this.catalog?.some(candidate => candidate.referenceName === field.referenceName)) throw new Error("Choose an available work-item field first.");
      const ids = [...new Set(items.map(item => api.itemRoute(item.url, this.pageUrl).id))];
      if (!ids.length) throw new Error("There are no work items to copy.");
      return this.run(async signal => {
        const rows = new Map();
        for (let start = 0; start < ids.length; start += 50) {
          const batch = ids.slice(start, start + 50);
          const fields = [...new Set(["System.Id", "System.Title", "System.State", field.referenceName])].join(",");
          const values = await this.get(`workitems?ids=${batch.join(",")}&fields=${encodeURIComponent(fields)}&errorPolicy=Fail&api-version=7.1`, signal);
          for (const item of values) {
            const id = String(item?.id), data = item?.fields;
            if (!batch.includes(id) || rows.has(id) || (data?.["System.Id"] != null && String(data["System.Id"]) !== id)
              || typeof data?.["System.Title"] !== "string" || !data["System.Title"].trim()
              || typeof data?.["System.State"] !== "string" || !data["System.State"].trim()) throw new Error("Azure DevOps returned incomplete or mismatched work-item data. Nothing was copied.");
            rows.set(id, { title: data["System.Title"], state: data["System.State"], value: data[field.referenceName] });
          }
          if (batch.some(id => !rows.has(id))) throw new Error("Some work items could not be read. Nothing was copied.");
        }
        return ids.map(id => rows.get(id));
      });
    }
  }

  return { ReleaseTableClient, resolveField, cellText, formatTable };
});
