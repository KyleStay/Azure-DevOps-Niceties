const test = require("node:test");
const assert = require("node:assert/strict");
const { StateClient, itemRoute, snapshot, workflowStates } = require("../src/state-client.js");

const pageUrl = "https://dev.azure.com/example/project/_queries/query/1";
const itemUrl = "https://dev.azure.com/example/project/_workitems/edit/701";
const definition = { name: "Bug", states: [{ name: "New", color: "aaaaaa" }, { name: "Active", color: "0078d4" }, { name: "Closed", color: "107c10" }],
  transitions: { New: [{ to: "New" }, { to: "Active" }], Active: [{ to: "Active" }, { to: "Closed" }] } };
function item({ id = 701, rev = 4, state = "New", type = "Bug", project = "Actual Project" } = {}) {
  return { id, rev, fields: { "System.Id": id, "System.State": state, "System.WorkItemType": type, "System.TeamProject": project } };
}
const response = (body, status = 200, extra = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => body, ...extra });
function fixture({ fetch, timeout = 100, current = item(), workflow = definition, page = pageUrl } = {}) {
  const calls = [];
  const client = new StateClient({ pageUrl: page, timeout, fetch: async (url, options) => {
    calls.push({ url, options });
    if (fetch) return fetch(url, options);
    if (options.method === "PATCH") return response(item({ rev: 5, state: JSON.parse(options.body)[1].value }));
    return response(url.includes("/workitemtypes/") ? workflow : current);
  } });
  return { client, calls };
}

test("state routes stay within the current Azure HTTPS organization on both supported hosts", () => {
  assert.equal(itemRoute(itemUrl, pageUrl).api, "https://dev.azure.com/example/_apis/wit/workitems/701?api-version=7.1");
  assert.equal(itemRoute("https://example.visualstudio.com/Project%20One/_workitems/edit/701", "https://example.visualstudio.com/Project%20Two/_boards").api,
    "https://example.visualstudio.com/_apis/wit/workitems/701?api-version=7.1");
  for (const url of [
    "https://dev.azure.com/other/project/_workitems/edit/701", "http://dev.azure.com/example/project/_workitems/edit/701",
    "https://dev.azure.com:8443/example/project/_workitems/edit/701", "https://user:secret@dev.azure.com/example/project/_workitems/edit/701",
    "https://evil.test/example/project/_workitems/edit/701", "https://dev.azure.com/example/project/_workitems/edit/0",
    "https://dev.azure.com/example/project/_workitems/edit/701/extra", "https://dev.azure.com/example/project/_workitems/edit/9007199254740993",
  ]) assert.throws(() => itemRoute(url, pageUrl));
});

test("native backlog links with a trailing slash resolve to the same work item", () => {
  for (const [url, page] of [
    ["https://dev.azure.com/example/Project%20One/_workitems/edit/701/", pageUrl],
    ["https://example.visualstudio.com/Project%20One/_workitems/edit/701/?view=edit#state", "https://example.visualstudio.com/Project%20One/_sprints/backlog/team/iteration"],
  ]) {
    const route = itemRoute(url, page);
    assert.equal(route.id, "701");
    assert.equal(route.url, url);
    assert.match(route.api, /\/_apis\/wit\/workitems\/701\?api-version=7\.1$/);
  }
  for (const suffix of ["//", "/extra", "/extra/", "/%2f", "/701/"]) {
    assert.throws(() => itemRoute(`${itemUrl}${suffix}`, pageUrl));
  }
  assert.throws(() => itemRoute("https://dev.azure.com/other/project/_workitems/edit/701/", pageUrl));
});

test("workflow choices follow transitions and custom state names rather than hardcoded process states", () => {
  assert.deepEqual(workflowStates(definition, "New"), [{ name: "New", color: "#aaaaaa" }, { name: "Active", color: "#0078d4" }]);
  assert.deepEqual(workflowStates({ states: [{ name: "Triaged" }, { name: "Customer review" }], transitions: { Triaged: [{ to: "Customer review" }, { to: "Customer review" }] } }, "Triaged").map(state => state.name), ["Triaged", "Customer review"]);
  assert.deepEqual(workflowStates({ ...definition, transitions: {} }, "New").map(state => state.name), ["New"]);
  assert.deepEqual(workflowStates({ ...definition, isDisabled: true }, "New").map(state => state.name), ["New"]);
  assert.deepEqual(workflowStates({ states: [{ name: "To Do" }, { name: "Done", hidden: true }, { name: "Review", isDisabled: true }] }, "To Do").map(state => state.name), ["To Do"]);
  assert.equal(workflowStates({ states: [{ name: "Active", color: 'url("https://evil.test")' }] }, "Active")[0].color, "");
});

test("opening reads only needed item fields and uses the item's authoritative project and type", async () => {
  const { client, calls } = fixture();
  const session = await client.inspect(itemUrl);
  assert.equal(session.rev, 4);
  assert.equal(session.state, "New");
  assert.deepEqual(session.choices.map(choice => choice.name), ["New", "Active"]);
  assert.match(calls[0].url, /fields=System.Id,System.State,System.WorkItemType,System.TeamProject$/);
  assert.equal(calls[1].url, "https://dev.azure.com/example/Actual%20Project/_apis/wit/workitemtypes/Bug?api-version=7.1");
  for (const call of calls) {
    assert.equal(call.options.credentials, "include");
    assert.equal(call.options.redirect, "error");
    assert.equal(call.options.headers.Accept, "application/json");
  }
});

test("opening always refreshes the item revision while sharing short-lived workflow metadata", async () => {
  let revision = 3;
  const { client, calls } = fixture({ fetch: async url => response(url.includes("/workitemtypes/") ? definition : item({ rev: ++revision })) });
  assert.equal((await client.inspect(itemUrl)).rev, 4);
  assert.equal((await client.inspect(itemUrl)).rev, 5);
  assert.equal(calls.filter(call => call.url.includes("/workitemtypes/")).length, 1);
  assert.equal(calls.filter(call => call.url.includes("/workitems/")).length, 2);
});

test("authoritative custom project, type and state names keep their exact internal spacing", async () => {
  const current = item({ project: "Actual  Project", type: "Customer  Request", state: "Needs  Review" });
  const workflow = { name: "Customer  Request", states: [{ name: "Needs  Review" }, { name: "Ready  To Ship" }],
    transitions: { "Needs  Review": [{ to: "Ready  To Ship" }] } };
  const { client, calls } = fixture({ fetch: async (url, options) => response(options.method === "PATCH"
    ? item({ project: "Actual  Project", type: "Customer  Request", state: "Ready  To Ship", rev: 5 })
    : url.includes("/workitemtypes/") ? workflow : current) });
  const session = await client.inspect(itemUrl);
  assert.match(calls[1].url, /Actual%20%20Project\/_apis\/wit\/workitemtypes\/Customer%20%20Request/);
  assert.equal((await client.save(session, "Ready  To Ship")).state, "Ready  To Ship");
  assert.equal(JSON.parse(calls[2].options.body)[1].value, "Ready  To Ship");
});

test("choosing a state sends exactly one revision-checked patch with normal Azure rules", async () => {
  const { client, calls } = fixture();
  const session = await client.inspect(itemUrl);
  const saved = await client.save(session, "Active");
  assert.equal(saved.state, "Active");
  assert.equal(saved.rev, 5);
  const writes = calls.filter(call => call.options.method === "PATCH");
  assert.equal(writes.length, 1);
  assert.deepEqual(JSON.parse(writes[0].options.body), [
    { op: "test", path: "/rev", value: 4 }, { op: "add", path: "/fields/System.State", value: "Active" },
  ]);
  assert.equal(writes[0].options.headers["Content-Type"], "application/json-patch+json");
  assert.equal(/bypassRules|suppressNotifications|validateOnly/.test(writes[0].url), false);
  assert.equal(client.saving.size, 0);
});

test("unchanged, invalid, recycled, and tampered selections cannot issue a write", async () => {
  const { client, calls } = fixture();
  const session = await client.inspect(itemUrl);
  assert.equal(await client.save(session, "New"), session);
  await assert.rejects(client.save(session, "Closed"), /available states/);
  await assert.rejects(client.save(session, "Active", () => false), /list changed/);
  for (const change of [{ rev: 0 }, { rev: 2.5 }, { id: "702" }, { key: "other/701" }, { url: "https://dev.azure.com/other/_workitems/edit/701" }]) {
    await assert.rejects(client.save({ ...session, ...change }, "Active"));
  }
  assert.equal(calls.filter(call => call.options.method === "PATCH").length, 0);
});

test("duplicate representations cannot save the same item concurrently", async () => {
  let finish;
  const { client, calls } = fixture({ fetch: async (url, options) => {
    if (options.method === "PATCH") return new Promise(resolve => { finish = () => resolve(response(item({ rev: 5, state: "Active" }))); });
    return response(url.includes("/workitemtypes/") ? definition : item());
  } });
  const session = await client.inspect(itemUrl);
  const first = client.save(session, "Active");
  await assert.rejects(client.save({ ...session, url: `${itemUrl}?duplicate=true` }, "Active"), /already saving/);
  finish();
  await first;
  assert.equal(calls.filter(call => call.options.method === "PATCH").length, 1);
});

for (const [status, message, expected] of [
  [403, "Forbidden", /permission/], [401, "Sign in", /permission/],
  [400, "A required Resolution field is missing", /required Resolution/],
  [400, "JsonPatch test failed at revision", /work item changed/], [409, "Conflict", /work item changed/], [412, "Precondition", /work item changed/],
  [500, "Server error", /could not be confirmed/], [408, "Request timeout", /could not be confirmed/],
]) {
  test(`a ${status} save failure is reported without retrying or bypassing rules: ${message}`, async () => {
    const { client, calls } = fixture({ fetch: async (url, options) => options.method === "PATCH"
      ? response({ message }, status) : response(url.includes("/workitemtypes/") ? definition : item()) });
    const session = await client.inspect(itemUrl);
    await assert.rejects(client.save(session, "Active"), expected);
    assert.equal(session.state, "New");
    assert.equal(calls.filter(call => call.options.method === "PATCH").length, 1);
    assert.equal(client.saving.size, 0);
  });
}

test("save timeouts and network loss are treated as unconfirmed and never retried", async () => {
  for (const stage of ["fetch", "json", "network"]) {
    let finish;
    const late = new Promise(resolve => { finish = resolve; });
    const { client, calls } = fixture({ timeout: 20, fetch: async (url, options) => {
      if (options.method !== "PATCH") return response(url.includes("/workitemtypes/") ? definition : item());
      if (stage === "network") throw new TypeError("Failed to fetch");
      return stage === "fetch" ? late : { ok: true, json: () => late };
    } });
    const session = await client.inspect(itemUrl);
    await assert.rejects(client.save(session, "Active"), /could not be confirmed/);
    finish(stage === "fetch" ? response(item({ rev: 5, state: "Active" })) : item({ rev: 5, state: "Active" }));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(session.state, "New");
    assert.equal(client.saving.size, 0);
    assert.equal(calls.filter(call => call.options.method === "PATCH").length, 1);
  }
});

test("cancellation and preference revocation stop metadata reads and discard late responses", async () => {
  let finish;
  const { client, calls } = fixture({ fetch: () => new Promise(resolve => { finish = resolve; }) });
  const controller = new AbortController();
  const pending = client.inspect(itemUrl, controller.signal);
  controller.abort();
  await assert.rejects(pending, /Could not load/);
  finish(response(item()));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.length, 1);
  assert.equal(client.definitions.size, 0);
  client.close();
  await assert.rejects(client.inspect(itemUrl), /no longer active/);
  assert.equal(calls.length, 1);
});

test("closing the client during a save stops further requests without retrying a possibly committed write", async () => {
  let finish;
  const { client, calls } = fixture({ fetch: async (url, options) => options.method === "PATCH"
    ? new Promise(resolve => { finish = resolve; }) : response(url.includes("/workitemtypes/") ? definition : item()) });
  const session = await client.inspect(itemUrl);
  const pending = client.save(session, "Active");
  client.close();
  await assert.rejects(pending, /could not be confirmed/);
  finish(response(item({ rev: 5, state: "Active" })));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(client.saving.size, 0);
  assert.equal(client.controllers.size, 0);
  assert.equal(calls.filter(call => call.options.method === "PATCH").length, 1);
  await assert.rejects(client.inspect(itemUrl), /no longer active/);
});

test("redirects, wrong items, malformed revisions, and wrong workflows cannot be used for editing", async () => {
  for (const body of [item({ id: 702 }), item({ rev: 0 }), item({ state: "" }), item({ project: ".." }), item({ type: "../Bug" })]) {
    const { client, calls } = fixture({ current: body });
    await assert.rejects(client.inspect(itemUrl));
    assert.equal(calls.length, 1);
  }
  for (const extra of [{ redirected: true }, { url: "https://dev.azure.com/other/_apis/wit/workitems/701" }]) {
    const { client } = fixture({ fetch: async () => response(item(), 200, extra) });
    await assert.rejects(client.inspect(itemUrl), /redirected/);
  }
  const { client } = fixture({ workflow: { ...definition, name: "Task" } });
  await assert.rejects(client.inspect(itemUrl), /different work-item type/);
  assert.throws(() => snapshot({ ...item(), fields: { ...item().fields, "System.Id": 702 } }, "701"));
});

test("a save acknowledgement must match the selected item, state, project, type, and a newer revision", async () => {
  for (const saved of [item({ id: 702, rev: 5, state: "Active" }), item({ rev: 4, state: "Active" }), item({ rev: 5, state: "Closed" }),
    item({ rev: 5, state: "Active", type: "Task" }), item({ rev: 5, state: "Active", project: "Other" })]) {
    const { client } = fixture({ fetch: async (url, options) => response(options.method === "PATCH" ? saved : url.includes("/workitemtypes/") ? definition : item()) });
    await assert.rejects(client.save(await client.inspect(itemUrl), "Active"));
  }
});
