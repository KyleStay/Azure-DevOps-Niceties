const test = require("node:test");
const assert = require("node:assert/strict");
const { estimateNumber, summarize } = require("../src/selection-summary.js");

test("estimates preserve zero and decimals, rejecting missing, negative, and ambiguous values", () => {
  for (const value of ["", "—", "N/A", "5 points", "-1", "Infinity", "1,5", "1.2.3"]) {
    assert.equal(estimateNumber(value), null, value);
  }
  assert.equal(estimateNumber("0"), 0);
  assert.equal(estimateNumber("1,234.5"), 1234.5);
  assert.equal(estimateNumber("1.234,5", "de-DE"), 1234.5);
  assert.equal(estimateNumber("1\u202f234,5", "fr-FR"), 1234.5);
  assert.equal(estimateNumber("1,5", "de-DE"), 1.5);
});

test("localized digit systems and Indian grouping retain their numeric values", () => {
  for (const locale of ["en-IN", "ar-EG", "fa-IR", "bn-BD"]) {
    const formatted = new Intl.NumberFormat(locale).format(1234567.5);
    assert.equal(estimateNumber(formatted, locale), 1234567.5, `${locale}: ${formatted}`);
  }
  assert.equal(estimateNumber("١٢٫٥", "ar-EG"), 12.5);
  assert.equal(estimateNumber("12,34,567.5", "en-IN"), 1234567.5);
  assert.equal(estimateNumber("1.5", "bad_locale"), 1.5);
  assert.equal(estimateNumber(-1), null);
});

test("unique items keep separate estimate units and expose missing data", () => {
  const result = summarize([
    { key: "1", Effort: "3", type: "User Story", state: "Active", assignee: "" },
    { key: "1", Effort: "", type: "User Story" },
    { key: "2", Effort: "0", "Story Points": "5", type: "Bug", state: "New", assignee: "Ada" },
    { key: "3", Effort: "—", Size: "2.5", type: "User Story", state: "Active" },
  ]);
  assert.equal(result.count, 3);
  assert.deepEqual(result.estimates, [
    { name: "Effort", total: 3, known: 2, missing: 1, displayed: true },
    { name: "Story Points", total: 5, known: 1, missing: 2, displayed: true },
    { name: "Size", total: 2.5, known: 1, missing: 2, displayed: true },
  ]);
  assert.deepEqual(result.types, [["User Story", 2], ["Bug", 1]]);
  assert.deepEqual(result.states, [["Active", 2], ["New", 1]]);
  assert.equal(result.unassigned, 1);
  assert.equal(result.assignmentUnknown, 1);
});

test("a blank estimate column remains displayed, with no invented zero total", () => {
  const result = summarize([{ key: "1", Effort: "", assignee: "Unassigned" }]);
  assert.deepEqual(result.estimates[0], { name: "Effort", total: 0, known: 0, missing: 1, displayed: true });
  assert.equal(result.estimates[1].displayed, false);
  assert.equal(result.unassigned, 1);
});
