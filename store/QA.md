# Release verification — 0.6.3

Verified October 14, 2026, on macOS with disposable Chrome for Testing 151.0.7922.34.

## Results

| Check | Result |
| --- | --- |
| Unit tests | 118 passed, 0 failed, 0 skipped |
| Syntax, public-content, diff whitespace | Passed |
| Upload ZIP | 14 allowlisted runtime files; manifest at root; integrity and referenced-file checks passed |
| Exact upload ZIP browser suite | Passed after extracting the ZIP into a new directory |
| Real public Azure DevOps theme | Native dark/light switching, live opt-out, persisted opt-out after reload and appearance changes, re-enable passed |
| Real system clipboard | All five individual copy formats; single-line plain text; rich inline link without font styling, paragraphs, or blank rows |
| Real paste | Rich editor, editable table cell, plain textarea; links remain clickable and inherit destination font |
| Release-stage list | Visible enable disclosure, row selection, individual Copy/Open, selected/all-loaded copying, clear and keyboard controls; linked and linkless grids, stage-dialog summary, collapsed/recycled rows; rich, Markdown, IDs, URLs with one item per line; duplicates, hidden, unsafe, mismatched and ambiguous rows excluded |
| Selection summaries | Separate estimates, zero/missing values, localized digits/grouping, document-start restoration, duplicate/legacy/checkbox selections, live edits, collapse, clearing and independent opt-out |
| Theme recovery | Current synchronous and legacy AMD loaders; delayed readiness, failed/hung providers, stale callbacks, navigation resets, visible-tab recovery, high contrast and forced colors |
| Existing copy behavior | Modifiers, shortcuts, optional parent lookup/cache, request cancellation, editable/hidden guards, native fallback and clipboard ordering passed |
| Publishing helper | Exact ZIP and five PNG downloads match release bytes; native/fallback copy, private-note handling and all five mobile steps passed |

Tested upload ZIP SHA-256:

```text
099ee233b07bb2259ccf75357bb3e276370f39cb9453365888ac4d808222fe13
```

The ZIP is reproducible. Regenerating the submission kit to refresh screenshots or this report must preserve that runtime hash. Any later runtime edit requires a new package and browser verification.

## Default-on selection summaries — October 14, 2026

Selection summaries now start enabled when no preference is saved, independently of enhanced copying. Existing explicit opt-outs remain off. New unit regressions verify default startup, saved opt-out restoration, live disabling and failed-save rollback. The browser regression checks the default summary before changing settings, then disables it, reloads, and confirms the saved opt-out.

## Default-on copying and checkbox column — October 14, 2026

New unit regressions verify copying with no saved preference, preservation of explicit off choices, and failure recovery. Browser scenarios verify immediate release controls, opt-out persistence after reload, a header select-all checkbox, aligned first-column checkboxes and final Copy columns in tables and ARIA grids, native table colgroup restoration, and unchanged clipboard output and estimate totals. The optional parent-context setting remains off by default; theme Automatic continues preserving native dark/high-contrast choices.

## Automatic theme default — October 14, 2026

The extension now defaults to Automatic. The native theme metadata exposes the standard/default theme as Light (`ms.vss-web.vsts-theme`); a separate Default theme ID is not exposed. Automatic follows system appearance when that theme is initially selected and preserves selected dark, high-contrast and unrecognized theme IDs. It cannot distinguish an explicitly selected standard Light theme from that same default theme ID. The options menu exposes Automatic, On and Off; existing boolean On/Off settings remain compatible and take precedence.

Per-service state distinguishes extension-applied dark/light changes from observable native changes. Automatic continues following system changes after it applies dark mode, rechecks recreated services during navigation, preserves later manual dark selections when their theme ID changes, and discards pending theme definitions if a native selection changes while loading. An explicit Off makes no native module/provider requests. High contrast and forced colors are always preserved. Unit regressions cover these paths; browser scenarios verify automatic startup, both overrides and existing recovery behavior.

## Release-stage interaction — October 14, 2026

Release copying starts enabled when no local preference exists, and preserves explicit opt-outs. Each list has a dedicated first selection column with a header select-all checkbox, a final Copy column with individual buttons, safe Open links for linkless typed grids, Copy selected, Copy all loaded and Clear selection. Turning copying off removes the injected column and restores native table colgroups; a visible Enable copying card can re-enable it. Copy selected retains explicit reference snapshots while a mounted list is open, including temporarily unloaded rows; closing/replacing the list, changing views or turning copying off clears them. Summary totals remain limited to selected loaded rows.

Controlled browser tests cover linked tables, linkless ARIA grids, Type/Work Item Type headers, stage-dialog summary placement, duplicate/unsafe/mismatched references, per-row and selected clipboard output, text/keyboard interaction and opt-out cleanup. These are actual manifest-loaded controls with real clipboard reads/paste, using synthetic page fixtures. No signed-in release tab was available in the connected browser, so compatibility with the user's exact stage view is not established. The version is raised to 0.6.3 so the new package is distinct from prior 0.6.2 artifacts.

A focused independent review found selection-lifetime wording, recycled Open-link controls, overly broad Ctrl/Command+C interception and missing test-type icon recognition. The changes now preserve selections while a mounted scope collapses or loses rows, state their view lifetime, rebuild widgets when a row or link mode changes, reserve ordinary copy interception for the extension's own selection controls, and recognize test types in summaries. Regression scenarios cover these fixes.

## Type-based release selection — October 14, 2026

The always-available Select by type controls select loaded items of chosen types and reflect individual row selections, including mixed states. Unchecking a type removes selected references of that type even if unloaded. Standard long and abbreviated names share a choice; custom types work without a fixed allowlist. Copy selected uses the chosen references, while Copy all loaded includes all types. Browser regressions cover Bug/PBI selection excluding Tasks, correct Effort totals and clipboard output, duplicate ID/type conflicts, aliases, custom types, partial and keyboard selection, clearing unloaded references and opt-out cleanup. Type choices use the existing per-list selection state and make no requests or persistent writes.

## Review fixes

An independent read-only review identified two selection-summary defects, both confirmed and fixed: locale parsing rejected valid localized digits/Indian grouping, and preferences arriving before the document root could lose selection observation. New regression tests pass for both.

A focused second review found that a raw Title-column value could lose a legitimate leading type/ID phrase. Explicit Title values now retain their full text; prefix removal is limited to composite display labels. Unit and real clipboard regressions cover the preserved title.

Live theme verification exposed a Microsoft loader compatibility issue. The current native registry accepts a string and returns its module synchronously; older pages use AMD array/callback loading. The extension now supports both, with bounded load timeouts, stale-result guards, backoff, and visible-tab recovery.

Copied references collapse source whitespace, including tabs and Unicode line separators, and trim both ends. Individual and parent/child copies have no newline. Release lists insert exactly one newline between distinct references and no trailing newline. Rich HTML uses bare inline anchors; only list copies add one `<br>` separator between items. No fonts, styles, paragraph/table wrappers, or selected-page markup enter the clipboard. Standard long work-item types shorten to PBI, US, TC, TP, and TS.

List copying is explicitly limited to visible loaded rows and omits parent context. The count is shown on the button. Turning copying off removes the control and cancels pending copying; filtering updates its count. Pasted links in editable destinations do not become another release list.

## Evidence limits and submission requirements

Controlled Azure-domain fixtures exercise the actual manifest-loaded extension, with real system clipboard reads and keyboard paste. Other browser scenarios simulate parent API responses and failure conditions. Native theme checks use a public anonymous Azure DevOps page. No private organization, authenticated parent API, live release-stage page, legacy host, Windows/Linux, or Chrome 111 was available for service-specific verification. The user requested direct clipboard-format verification rather than an Excel web workbook test; Excel itself was not exercised. Microsoft service/markup changes may affect compatibility.

The 0.6.0 public policy was verified after publication. This release updates the policy to describe default-on copying and saved opt-outs; publish and verify the matching `docs/privacy.html` before store submission. Listing, local policy and dashboard explanations now disclose selection summaries, release lists, sync preferences and displayed assignments. The store's remote-code review note explicitly describes the native page-owned theme service; store acceptance has not been established.

Provide dedicated, non-sensitive reviewer access and complete the authenticated procedure in `REVIEWER-TESTS.md` where available. Publisher account fields and Google review remain external steps. No Web Store upload or publication was performed.

Only synthetic instance URLs and sample content are committed. Disposable browser profiles are removed by the harness; supported original clipboard formats are kept in memory and restored without logging their contents. The exact ZIP run restored the clipboard and removed its profile. Recorded owned browser birth identities were verified gone after the runs; the final supported process inventory contained no Chrome for Testing processes.
