(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root.document) api.start(root);
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const FLAG = "data-azure-niceties-state-editing";
  const TOPIC = "azure-niceties-state-saved";

  function context(url) {
    const page = new URL(url);
    return `${page.origin}/${page.hostname === "dev.azure.com" ? page.pathname.split("/")[1] : ""}`.toLowerCase();
  }

  function createSynchronizer(root, getService) {
    const pending = new Map();
    let timer;
    let running = false;
    let generation = 0;
    const enabled = () => root.document.documentElement?.getAttribute(FLAG) === "true";

    function clear() {
      generation++;
      pending.clear();
      root.clearTimeout(timer);
      timer = null;
    }

    function schedule(delay = 1000) {
      if (pending.size && enabled() && !root.document.hidden && timer == null) timer = root.setTimeout(check, delay);
    }

    async function check() {
      root.clearTimeout(timer);
      timer = null;
      if (!enabled()) { clear(); return; }
      if (running || root.document.hidden || !pending.size) return;
      const scope = context(root.location.href);
      for (const [id, record] of pending) if (record.scope !== scope || record.expires <= Date.now()) pending.delete(id);
      if (!pending.size) return;
      running = true;
      const version = generation;
      let expired = false;
      let deadline;
      const valid = () => !expired && enabled() && generation === version && context(root.location.href) === scope;
      const work = async () => {
        const service = await getService();
        if (!valid() || !["hasActiveWorkItem", "getId", "getRevision", "isDirty", "refresh"].every(name => typeof service?.[name] === "function")) return;
        if (!await service.hasActiveWorkItem() || !valid()) return;
        const id = String(await service.getId());
        const record = pending.get(id);
        if (!valid() || !record || record.refreshing) return;
        const revision = await service.getRevision();
        if (!valid() || pending.get(id) !== record || !Number.isSafeInteger(revision)) return;
        if (revision >= record.rev) { pending.delete(id); return; }
        if (await service.isDirty() !== false || !valid()) return;
        // Recheck after asynchronous reads; a form can switch items while open.
        if (String(await service.getId()) !== id || !valid() || pending.get(id) !== record) return;
        if (await service.isDirty() !== false || !valid()) return;
        if (record.attempts >= 3) { pending.delete(id); return; }
        record.attempts++;
        record.refreshing = true;
        try { await service.refresh(); }
        finally { record.refreshing = false; }
        if (!valid() || pending.get(id) !== record || String(await service.getId()) !== id) return;
        if (await service.getRevision() >= record.rev && valid()) pending.delete(id);
      };
      try {
        await Promise.race([work(), new Promise(resolve => {
          deadline = root.setTimeout(() => { expired = true; resolve(); }, 5000);
        })]);
      } catch (_) { /* Native services vary by page; never substitute a save or reload. */ }
      finally {
        expired = true;
        root.clearTimeout(deadline);
        running = false;
        schedule();
      }
    }

    function saved(id, rev) {
      id = String(id);
      if (!enabled() || !/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)) || !Number.isSafeInteger(rev) || rev < 1) return;
      const previous = pending.get(id);
      if (previous && previous.rev >= rev) return;
      pending.set(id, { rev, scope: context(root.location.href), expires: Date.now() + 300_000, attempts: 0 });
      if (pending.size > 100) pending.delete(pending.keys().next().value);
      schedule(0);
    }

    return { saved, check, clear, schedule };
  }

  function start(root) {
    let module;
    let retryAfter = 0;
    function getService() {
      if (Date.now() < retryAfter) return Promise.resolve(null);
      const onItemPage = /\/_workitems\/edit\/[1-9]\d*\/?$/i.test(new URL(root.location.href).pathname);
      const visibleForm = [...root.document.querySelectorAll(".work-item-form,.work-item-form-page,[data-testid='work-item-form']")]
        .some(form => form.getClientRects().length > 0);
      if (!onItemPage && !visibleForm) return Promise.resolve(null);
      // Use the page-owned, documented form service, as with native theme APIs.
      // The synchronous registry and the older AMD loader expose the same API.
      if (!module) module = new Promise((resolve, reject) => {
        if (typeof root.require !== "function") { reject(new Error("Form service unavailable")); return; }
        const timeout = root.setTimeout(() => reject(new Error("Form service unavailable")), 1000);
        const failed = error => { root.clearTimeout(timeout); reject(error); };
        const loaded = value => {
          if (typeof value?.WorkItemFormService?.getService !== "function") { failed(new Error("Form service unavailable")); return; }
          root.clearTimeout(timeout); resolve(value);
        };
        let registered;
        try { registered = root.require("TFS/WorkItemTracking/Services"); } catch (_) {}
        if (typeof registered?.WorkItemFormService?.getService === "function") loaded(registered);
        else {
          try { root.require(["TFS/WorkItemTracking/Services"], loaded, failed); } catch (error) { failed(error); }
        }
      }).catch(error => { module = null; retryAfter = Date.now() + 30_000; throw error; });
      return module.then(api => api?.WorkItemFormService?.getService());
    }

    const synchronizer = createSynchronizer(root, getService);
    root.addEventListener("message", event => {
      if (event.source !== root || event.origin !== new URL(root.location.href).origin || event.data?.type !== TOPIC) return;
      synchronizer.saved(event.data.id, event.data.rev);
    });
    const observer = new root.MutationObserver(() => {
      if (root.document.documentElement?.getAttribute(FLAG) !== "true") synchronizer.clear();
    });
    observer.observe(root.document.documentElement, { attributes: true, attributeFilter: [FLAG] });
    root.document.addEventListener("visibilitychange", () => synchronizer.schedule(0));
    root.addEventListener("pagehide", synchronizer.clear);
    return synchronizer;
  }

  return { createSynchronizer, start };
});
