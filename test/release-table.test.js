const test = require("node:test");
const assert = require("node:assert/strict");
const { ReleaseTableClient, resolveField, formatTable } = require("../src/release-table.js");
const pageUrl = "https://dev.azure.com/example/project/_releaseProgress?releaseId=53";
const qa = { name: "Assigned QA PBI", referenceName: "Custom.AssignedQAPBI", type: "string" };
const item = id => ({ url: `https://dev.azure.com/example/project/_workitems/edit/${id}` });
const responseItem = (id, value = "QA owner") => ({ id, fields: { "System.Id": id, "System.Title": `Title ${id}`, "System.State": "Done", [qa.referenceName]: value } });
const response = value => ({ ok: true, json: async () => ({ value }) });
function client(options = {}) {
  const calls = [];
  const value = new ReleaseTableClient({ pageUrl, ...options, fetch: async (url, init) => {
    calls.push({ url, init });
    if (url.includes("/fields?")) return response([qa, { name: "Title", referenceName: "System.Title", type: "string" }]);
    return options.fetch ? options.fetch(url, init) : response(new URL(url).searchParams.get("ids").split(",").map(id => responseItem(Number(id))));
  } });
  return { value, calls };
}

test("field picker resolves custom display names and reference names without confusing duplicate names", () => {
  assert.equal(resolveField([qa], " assigned qa pbi "), qa);
  assert.equal(resolveField([qa], "custom.assignedqapbi"), qa);
  assert.throws(() => resolveField([qa, { ...qa, referenceName: "Other.QA" }], qa.name), /reference name/);
  assert.throws(() => resolveField([qa], "not a field"), /Choose a field/);
});

test("browser request functions retain the global receiver", async () => {
  const value = new ReleaseTableClient({ pageUrl, fetch: function () {
    assert.equal(this, globalThis);
    return Promise.resolve(response([qa]));
  } });
  assert.deepEqual(await value.fields(), [qa]);
});

test("clipboard table has exactly three columns, headers, escaped HTML, and tab-separated plain text", () => {
  const formatted = formatTable([{ title: 'Fix <table> & "copy"\t now', state: "In\nProgress", value: "QA\r\nOwner" },
    { title: "Empty field", state: "Done", value: null }], qa);
  assert.equal(formatted.plainText, 'Title\tState\tAssigned QA PBI\r\nFix <table> & "copy" now\tIn Progress\tQA Owner\r\nEmpty field\tDone\t');
  assert.equal((formatted.html.match(/<th>/g) || []).length, 3);
  assert.equal((formatted.html.match(/<td>/g) || []).length, 6);
  assert.ok(formatted.html.includes("Fix &lt;table&gt; &amp; &quot;copy&quot; now"));
  assert.equal(formatted.rich, true);
});

test("table preserves identities, zero, false and negative numbers, and treats formula-like strings as text", () => {
  for (const [value, expected] of [[{ displayName: "QA Person", uniqueName: "private@example.test" }, "QA Person"], [0, "0"], [false, "false"], [-5, "-5"], ["=1+1", "'=1+1"], [" \t@SUM(A1)", "'@SUM(A1)"], ["-2+3", "'-2+3"]]) {
    const table = formatTable([{ title: "Title", state: "Done", value }], qa);
    assert.equal(table.plainText.split("\r\n")[1].split("\t")[2], expected);
    assert.equal(table.html.includes("private@example.test"), false);
  }
  assert.throws(() => formatTable([{ title: "Title", state: "Done", value: { unknown: true } }], qa), /unsupported value/);
  assert.throws(() => formatTable([], qa), /no work items/);
});

test("rich-text fields use the inert text converter before escaping", () => {
  let input;
  const table = formatTable([{ title: "Title", state: "Done", value: "<div>QA &amp; review</div>" }], { ...qa, type: "html" }, value => { input = value; return "QA & review"; });
  assert.equal(input, "<div>QA &amp; review</div>");
  assert.ok(table.html.includes("<td>QA &amp; review</td>"));
});

test("custom fields are fetched on demand; read-only batches request only IDs, Title, State, and the chosen field", async () => {
  const { value, calls } = client();
  assert.equal(calls.length, 0);
  assert.deepEqual(await value.fields(), [qa]);
  await value.fields();
  assert.equal(calls.length, 1, "catalog stays in memory until closed");
  const items = [item(3), item(1), item(3), ...Array.from({ length: 50 }, (_, index) => item(index + 10))];
  const rows = await value.read(items, qa);
  assert.equal(rows.length, 52); assert.equal(rows[0].title, "Title 3"); assert.equal(rows[1].title, "Title 1");
  assert.deepEqual(calls.slice(1).map(call => new URL(call.url).searchParams.get("ids").split(",").length), [50, 2]);
  for (const { url, init } of calls) {
    assert.ok(url.startsWith("https://dev.azure.com/example/_apis/wit/"));
    assert.equal(init.method, "GET"); assert.equal(init.credentials, "include"); assert.equal(init.redirect, "error");
    if (url.includes("workitems?")) {
      assert.equal(new URL(url).searchParams.get("fields"), "System.Id,System.Title,System.State,Custom.AssignedQAPBI");
      assert.equal(new URL(url).searchParams.get("errorPolicy"), "Fail");
    }
  }
  value.close(); assert.equal(value.catalog, null);
  await assert.rejects(value.fields(), /no longer/);
});

test("table uses current server states, preserves snapshot order, and leaves missing optional fields blank", async () => {
  const { value } = client({ fetch: async () => response([responseItem(2, null), { ...responseItem(1), fields: { ...responseItem(1).fields, "System.State": "Active" } }]) });
  await value.fields();
  assert.deepEqual((await value.read([item(1), item(2)], qa)).map(row => [row.title, row.state, row.value]), [["Title 1", "Active", "QA owner"], ["Title 2", "Done", null]]);
});

for (const [name, payload] of [["missing items", []], ["wrong item", [responseItem(2)]], ["duplicate item", [responseItem(1), responseItem(1)]],
  ["wrong field ID", [{ ...responseItem(1), fields: { ...responseItem(1).fields, "System.Id": 9 } }]],
  ["missing title", [{ ...responseItem(1), fields: { "System.State": "Done" } }]],
  ["missing state", [{ ...responseItem(1), fields: { "System.Title": "Title" } }]]]) {
  test(`table refuses incomplete copies: ${name}`, async () => {
    const { value } = client({ fetch: async () => response(payload) });
    await value.fields(); await assert.rejects(value.read([item(1)], qa), /Nothing was copied/);
  });
}

test("table refuses unknown fields and unsafe or foreign work-item routes before any item request", async () => {
  const { value, calls } = client(); await value.fields();
  await assert.rejects(value.read([item(1)], { ...qa, referenceName: "Other.Unknown" }), /available/);
  for (const url of ["https://dev.azure.com/other/project/_workitems/edit/1", "https://dev.azure.com/example/project/_workitems/edit/0", "http://dev.azure.com/example/project/_workitems/edit/1"]) {
    await assert.rejects(value.read([{ url }], qa));
  }
  assert.equal(calls.length, 1);
});

for (const [name, reply] of [["permission denial", { ok: false }], ["redirect", { ...response([]), redirected: true }],
  ["URL mismatch", { ...response([]), url: "https://dev.azure.com/other" }], ["malformed body", { ok: true, json: async () => ({}) }]]) {
  test(`table reports ${name}`, async () => {
    const { value } = client({ fetch: async () => reply }); await value.fields();
    await assert.rejects(value.read([item(1)], qa));
  });
}

for (const phase of ["fetch", "json"]) {
  test(`table deadline includes hung ${phase}`, async () => {
    const hung = new Promise(() => {});
    const { value } = client({ timeout: 15, fetch: async () => phase === "fetch" ? hung : { ok: true, json: () => hung } });
    await value.fields(); await assert.rejects(value.read([item(1)], qa), /timed out/);
    assert.equal(value.controllers.size, 0);
  });
}

test("closing a table client aborts in-flight reads and discards late replies", async () => {
  let release;
  const { value } = client({ fetch: () => new Promise(resolve => { release = resolve; }) }); await value.fields();
  const pending = value.read([item(1)], qa);
  value.close(); release(response([responseItem(1)]));
  await assert.rejects(pending, /cancelled/);
  assert.equal(value.catalog, null); assert.equal(value.controllers.size, 0);
});
