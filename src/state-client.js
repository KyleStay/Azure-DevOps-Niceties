(function (root, factory) {
  const core = root.AzureNicetiesWorkItem || (typeof require === "function" ? require("./work-item.js") : null);
  const api = factory(core);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.AzureNicetiesStateClient = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (core) {
  "use strict";

  function organizationUrl(value) {
    try {
      const url = new URL(value);
      if (url.protocol !== "https:" || url.username || url.password || url.port) return "";
      if (url.hostname === "dev.azure.com") {
        const organization = decodeURIComponent(url.pathname.split("/")[1] || "");
        if (!organization || organization.startsWith("_") || /[\\/]/.test(organization) || /^\.{1,2}$/.test(organization)) return "";
        return `${url.origin}/${encodeURIComponent(organization)}`;
      }
      return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.visualstudio\.com$/i.test(url.hostname) ? url.origin : "";
    } catch (_) { return ""; }
  }

  function itemRoute(itemUrl, pageUrl) {
    const safe = core.safeWorkItemUrl(itemUrl);
    const organization = organizationUrl(pageUrl);
    if (!safe || !organization || organizationUrl(safe).toLowerCase() !== organization.toLowerCase()
      || new URL(safe).origin !== new URL(pageUrl).origin) throw new Error("This work item is outside the current Azure DevOps organization.");
    const id = core.workItemIdFromUrl(safe);
    if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) throw new Error("The work-item ID is invalid.");
    return { id, url: safe, key: `${organization.toLowerCase()}/${id}`,
      organization, api: `${organization}/_apis/wit/workitems/${id}?api-version=7.1` };
  }

  function snapshot(payload, id) {
    const fields = payload?.fields;
    if (String(payload?.id) !== id || !Number.isSafeInteger(payload?.rev) || payload.rev < 1
      || (fields?.["System.Id"] != null && String(fields["System.Id"]) !== id)) throw new Error("Azure DevOps returned a different work item or an invalid revision.");
    const state = typeof fields?.["System.State"] === "string" ? fields["System.State"].trim() : "";
    const type = typeof fields?.["System.WorkItemType"] === "string" ? fields["System.WorkItemType"].trim() : "";
    const project = typeof fields?.["System.TeamProject"] === "string" ? fields["System.TeamProject"].trim() : "";
    if (!state || !type || !project || [type, project].some(name => /^\.{1,2}$/.test(name) || /[\\/]/.test(name))) {
      throw new Error("Azure DevOps did not return the state, type, and project needed to edit this item.");
    }
    return { id, rev: payload.rev, state, type, project };
  }

  function workflowStates(definition, current) {
    if (definition?.isDisabled) return [{ name: current, color: "" }];
    const states = new Map();
    const orderedStates = (Array.isArray(definition?.states) ? definition.states : [])
      .filter(state => typeof state?.name === "string" && state.name.trim() && !state.hidden && !state.isDisabled);
    // Prefer explicit process order when supplied; otherwise keep the server's
    // definition order rather than transition order or the current state first.
    if (orderedStates.every(state => Number.isFinite(state.order))) orderedStates.sort((a, b) => a.order - b.order);
    for (const state of orderedStates) {
      const name = state.name.trim();
      if (name) states.set(name, /^[a-f0-9]{6}$/i.test(state.color || "") ? `#${state.color}` : "");
    }
    let names = [...states.keys()];
    if (definition?.transitions != null) {
      const transitions = Object.hasOwn(definition.transitions, current) ? definition.transitions[current] : [];
      names = Array.isArray(transitions) ? transitions.filter(transition => typeof transition?.to === "string")
        .map(transition => transition.to.trim()).filter(name => name && (!states.size || states.has(name))) : [];
    }
    const allowed = new Set([current, ...names]);
    const ordered = [...states.keys()].filter(name => allowed.has(name));
    return [...new Set([...(states.has(current) ? [] : [current]), ...ordered, ...names])]
      .map(name => ({ name, color: states.get(name) || "" }));
  }

  class StateClient {
    constructor({ pageUrl, fetch: request = globalThis.fetch, timeout = 10_000 } = {}) {
      this.pageUrl = pageUrl;
      this.fetch = request;
      this.timeout = timeout;
      this.controllers = new Set();
      this.definitions = new Map();
      this.saving = new Set();
      this.closed = false;
    }

    close() {
      this.closed = true;
      for (const controller of this.controllers) controller.abort();
      this.definitions.clear();
    }

    async request(url, options = {}, signal) {
      if (this.closed) throw new Error("State editing is no longer active.");
      const controller = new AbortController();
      const abort = () => controller.abort();
      this.controllers.add(controller);
      signal?.addEventListener("abort", abort, { once: true });
      const write = options.method === "PATCH";
      const cancelled = new Promise((_, reject) => controller.signal.addEventListener("abort", () => {
        reject(new Error(write
          ? "The save could not be confirmed. Reopen the state picker to check the current state before trying again."
          : "Could not load states. Close the picker and try again."));
      }, { once: true }));
      const deadline = setTimeout(abort, this.timeout);
      if (signal?.aborted) abort();
      try {
        return await Promise.race([cancelled, (async () => {
          if (controller.signal.aborted) throw new Error("Cancelled");
          const response = await this.fetch(url, { ...options, credentials: "include", redirect: "error", signal: controller.signal,
            headers: { Accept: "application/json", ...options.headers } });
          if (controller.signal.aborted) throw new Error("Cancelled");
          if (response.redirected || (response.url && response.url !== url)) throw new Error("Azure DevOps redirected the request. Refresh the page and sign in again.");
          const body = await response.json().catch(() => null);
          if (controller.signal.aborted) throw new Error("Cancelled");
          if (!response.ok) {
            const message = core.normalizeWhitespace(body?.message || body?.Message || "").slice(0, 400);
            if (write && (response.status >= 500 || response.status === 408)) throw new Error("The save could not be confirmed. Reopen the state picker to check the current state before trying again.");
            if (response.status === 401 || response.status === 403) throw new Error("You do not have permission to change this work item. Open it in Azure DevOps to check access.");
            if ([409, 412].includes(response.status) || /revision|test.*(?:failed|value)|updated by|conflict/i.test(message)) {
              throw new Error("This work item changed. Close and reopen the state picker, then try again.");
            }
            throw new Error(message ? `Azure DevOps could not save this state: ${message}` : "Azure DevOps could not complete the request. Open the work item to check its required fields.");
          }
          if (!body) throw new Error("Azure DevOps returned an unreadable response. Reopen the state picker to check the current state.");
          return body;
        })()]);
      } catch (error) {
        if (write && (error instanceof TypeError || error.name === "AbortError")) {
          throw new Error("The save could not be confirmed. Reopen the state picker to check the current state before trying again.");
        }
        throw error;
      } finally {
        clearTimeout(deadline);
        signal?.removeEventListener("abort", abort);
        this.controllers.delete(controller);
      }
    }

    async withStateOrder(route, item, definition, signal) {
      if (!/^[\w.-]+$/.test(definition.referenceName || "") || /^\.{1,2}$/.test(definition.referenceName) || !Array.isArray(definition.states)) return definition;
      const controller = new AbortController();
      const abort = () => controller.abort();
      signal?.addEventListener("abort", abort, { once: true });
      const deadline = setTimeout(abort, 1500);
      try {
        if (signal?.aborted) abort();
        const project = await this.request(`${route.organization}/_apis/projects/${encodeURIComponent(item.project)}?includeCapabilities=true&api-version=7.1`, {}, controller.signal);
        const process = project?.capabilities?.processTemplate?.templateTypeId;
        if (project?.name !== item.project || !/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(process || "")) return definition;
        const result = await this.request(`${route.organization}/_apis/work/processes/${process}/workItemTypes/${encodeURIComponent(definition.referenceName)}/states?api-version=7.1`, {}, controller.signal);
        const order = new Map((Array.isArray(result?.value) ? result.value : []).filter(state =>
          typeof state?.name === "string" && Number.isFinite(state.order)).map(state => [state.name.trim(), state]));
        return { ...definition, states: definition.states.map(state => {
          const metadata = order.get(state?.name?.trim());
          return metadata ? { ...state, order: metadata.order, hidden: state.hidden || metadata.hidden } : state;
        }) };
      } catch (error) {
        if (signal?.aborted || this.closed) throw error;
        // Process metadata is optional; its permissions or availability must
        // not prevent editing with the authoritative type and transitions.
        return definition;
      } finally {
        clearTimeout(deadline);
        signal?.removeEventListener("abort", abort);
      }
    }

    async inspect(itemUrl, signal) {
      const route = itemRoute(itemUrl, this.pageUrl);
      const readUrl = `${route.api}&fields=System.Id,System.State,System.WorkItemType,System.TeamProject`;
      const item = snapshot(await this.request(readUrl, {}, signal), route.id);
      const typeUrl = `${route.organization}/${encodeURIComponent(item.project)}/_apis/wit/workitemtypes/${encodeURIComponent(item.type)}?api-version=7.1`;
      let cached = this.definitions.get(typeUrl);
      if (!cached || cached.expires <= Date.now()) {
        let definition = await this.request(typeUrl, {}, signal);
        if (typeof definition?.name !== "string" || definition.name.toLowerCase() !== item.type.toLowerCase()) throw new Error("Azure DevOps returned a different work-item type.");
        definition = await this.withStateOrder(route, item, definition, signal);
        cached = { definition: { name: definition.name, states: definition.states, transitions: definition.transitions, isDisabled: definition.isDisabled }, expires: Date.now() + 60_000 };
        if (!signal?.aborted) this.definitions.set(typeUrl, cached);
      }
      return { ...route, ...item, choices: workflowStates(cached.definition, item.state) };
    }

    async save(session, state, canSave = () => true) {
      const route = itemRoute(session.url, this.pageUrl);
      if (route.key !== session.key || route.id !== session.id || !Number.isSafeInteger(session.rev) || session.rev < 1) throw new Error("The work item changed. Reopen its state picker.");
      if (!session.choices.some(choice => choice.name === state)) throw new Error("Choose one of this work item's available states.");
      if (state === session.state) return session;
      if (this.saving.has(route.key)) throw new Error("This work item is already saving.");
      if (!canSave()) throw new Error("The list changed. Reopen the state picker before saving.");
      this.saving.add(route.key);
      try {
        const body = await this.request(route.api, { method: "PATCH", headers: { "Content-Type": "application/json-patch+json" },
          body: JSON.stringify([{ op: "test", path: "/rev", value: session.rev }, { op: "add", path: "/fields/System.State", value: state }]) });
        const saved = snapshot(body, route.id);
        if (saved.rev <= session.rev || saved.state !== state || saved.type !== session.type || saved.project !== session.project) {
          throw new Error("The save returned an unexpected result. Reopen the state picker to check the current state.");
        }
        return { ...session, ...saved };
      } finally { this.saving.delete(route.key); }
    }
  }

  return { organizationUrl, itemRoute, snapshot, workflowStates, StateClient };
});
