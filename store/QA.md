# Supplied Bolt release row — 0.6.10

The supplied live row exposed concrete gaps in earlier fixtures: native presentation/spacer cells were treated as data columns, a leading spacer could shadow ID’s index, the title’s nested work-item-small-view/title-link flex chain was missing from the test pages, and its native title anchor was empty. The new fixture reproduces those classes and column attributes with anonymized IDs/URLs, leading/trailing spacers, an empty title, and a real title equal to the state name Done.

Copying, State editing, and selection summaries now share presentation-cell exclusion and ARIA/zero-based Bolt indexing. Layout removes the spacers and gives the native title flex chain the remaining width. Empty titles use Microsoft’s read-only Work Items List API with only System.Id and System.Title, batches of at most 50, a three-second timeout, same-organization validation, response validation, one attempt per mounted-list key, consent/navigation cancellation, and page-memory caching. Native anchors remain untouched; owned fallback links disappear when native title text arrives. Incomplete copies remain disabled on metadata failure.

Tests cover batch coalescing/limits, failures/redirects/identity mismatches, invalid/outside-organization IDs, opt-out, navigation, late responses, and hung fetch/JSON. The supplied-row browser regression checks 35 rows at 360/836/1280px, zero spacer width, correct ID classification, aligned readable title wrappers, copied recovered text, unchanged native anchors, titles equal to state names, independent State opt-out/re-enable, recycled rows, permission failure, no PATCH writes, and cleanup. Browser results and exact ZIP evidence are recorded in the release verification receipt. The live authenticated page remains unavailable; this test uses the supplied row structure and mocked metadata.

API contract: [Microsoft Work Items — List](https://learn.microsoft.com/en-us/rest/api/azure/devops/wit/work-items/list?view=azure-devops-rest-7.1).

# Release list simplification — 0.6.9

The user's 0.6.8 screenshot invalidated the earlier layout assumptions: the toolbar and table were still constrained to a narrow strip. The earlier fixtures had a recognized dialog boundary and did not cover nested unnamed width constraints or headers outside a presentation table. Passing those tests did not establish the user's actual release layout.

The width walk now expands all intermediate wrappers up to the available-width boundary and retains that boundary across scans. Presentation/headerless row tables share the surrounding grid's headers. Inline-size containment is removed. The visible columns are Copy, selection, State, and flexible Title; standalone IDs and Type remain in extraction/copying data. Extra category-copy actions and type choices sit in native details menus. Clear selection appears only when needed, and the persistent instruction paragraph is removed.

Regression coverage adds a 35-row nested release page with three 280px-wide unnamed wrappers, separate grid headers, a presentation table, state dots, and deliberately 24px-wide inner text wrappers. At 360/836/1280px it checks table and toolbar width, all State/Title mappings, aligned useful title space, compact toolbar height, no horizontal overflow, menu access and Escape, hidden-ID copying, and complete opt-out restoration. Existing copy/selection/virtual-row checks remain. Browser evidence and exact-package results are recorded in the release verification receipt. These fixtures approximate the screenshot; authenticated Azure DevOps markup remains unavailable at the user's direction.

# Release list layout — 0.6.8

Release header parsing now recognizes native field metadata and labels split from sort descriptions. The prior parser treated decorated Title/State headers as unknown fields, allocating generic widths. A nested native title wrapper could also retain its old narrow width after the row stretched. Both are addressed without replacing native rows or changing their DOM order.

The compact layout gives Title the remaining width after copy, selection, ID, and State. Header/body spacing aligns, nested ID/Title/State wrappers use their column width, and copy icons use compact borderless buttons. Container queries hide the standalone ID below 440px to retain useful State/Title space. IDs stay in copying and selection data. The toolbar groups copy actions, clear, type choices, and a shorter selection-lifetime note. Opt-out removes the added wrapper markers and restores native widths.

All 213 Node tests pass, including decorated and ambiguous header cases and alternate metadata attributes. Browser regressions use native-style absolute virtual rows, sorted headers, deliberately 36px-wide nested title wrappers, populated 14-row lists, and 360/836/1280px views. They check overlay width, header/body alignment, useful title space, hidden Type, responsive ID visibility, no horizontal overflow, copy/selection behavior, and opt-out restoration. New captures show wide and narrow populated release lists. Browser source and exact-ZIP evidence is recorded in the release handoff. These are controlled fixtures; the authenticated release overlay is unavailable at the user's direction.

# Compact State controls, workflow order, and form refresh — 0.6.7

State controls use the available text width without a persistent arrow or its reserved spacing. Hover and an open picker show a highlight, and keyboard focus retains a visible outline. Browser regressions verify the supplied Bolt-row reproduction has no arrow, reserves no indicator width, fits Committed, and keeps its width on hover.

State choices use explicit project process order when accessible. An optional same-organization project-capability and process-state lookup is bounded by a 1.5-second deadline and cached with the workflow definition for one minute. Permission failures, missing metadata, and unsupported processes retain type-definition order. Current-state selection, valid transitions, and hidden/disabled exclusions remain intact. No extension permissions are added.

A confirmed save passes only the item ID and revision to a bundled MAIN-world form adapter. For up to five minutes, it checks a visible native form through the documented WorkItemFormService contract. It refreshes only a matching older clean form, checks identity and unsaved status again after asynchronous reads, stops on opt-out or organization navigation, and bounds late callbacks and refresh retries. It does not set fields, save the form, or reload the page. Native modules are not loaded while no form is visible. Missing native APIs leave native Refresh available; support on an authenticated Azure DevOps host is unverified because account access was declined.

All 211 Node tests pass. Browser regressions cover hover width, keyboard focus, process-ordered New/Approved/Committed/Done choices, opening a cached form after a confirmed save, preserving an unsaved title, and refreshing after the simulated independent edit is resolved. Source and exact-ZIP execution evidence is recorded in the release handoff. Item APIs, process metadata, and the native form-service contract in browser tests are mocked. These checks do not establish that every Azure DevOps page exposes the native service.

# Native sprint backlog links — 0.6.6

The user supplied an actual Bolt sprint backlog row whose title link ends in a slash. The shared safe-work-item URL validator rejected that link, causing State discovery to skip the whole row. It now accepts one optional trailing slash while preserving the existing HTTPS, host, same-organization, ID, and path restrictions.

All 195 Node tests pass. Six new regression tests failed against 0.6.5 and pass after the validator fix: route validation, copy output, and picker discovery on release, sprint, product-backlog, and query URLs. Tests also retain rejection of extra path segments, duplicate trailing slashes, and cross-organization links.

The manifest-loaded browser suite includes an anonymized reproduction of the supplied Bolt row, retaining its utility columns, ARIA indices, nested state text, type icon, tag list, and trailing-slash title link. On release, sprint-backlog, product-backlog, and query routes it checks one picker, no writes on opening, an explicit revision-checked save for the correct item, state-label refresh, and preservation of native Add, More options, and tag controls. All work-item API responses and writes in these tests are mocked. Source and exact-ZIP browser execution evidence is recorded in the release handoff; the user's signed-in environment remains unverified.

# State list compatibility — 0.6.5

Prepared October 15, 2026. The State editor now keeps nested item metadata within its structural work-item row, resolves split presentation-table headers, recognizes field-reference metadata and decorated column labels, ignores hidden native editors, and rescans style-only visibility changes. Separate native tables retain independent header mappings. Visible unsaved inputs and ambiguous or conflicting item identities remain protected.

All 187 Node tests pass, including 15 new compatibility regressions. Thirteen of those compatibility cases fail when run against the original 0.6.4 source in an isolated test directory; all 15 pass with the revised discovery code. Browser coverage adds controlled release-work-item, sprint-backlog, and product-backlog routes, each verifying picker opening, explicit revision-checked saving, cancellation and late-visible lists. The workflow repeats the full suite against the extracted upload ZIP. Final execution evidence is recorded in the release handoff. These fixtures do not establish the markup of the user's unavailable authenticated tab.

The 16-file runtime ZIP SHA-256 is `879f6764bdd156594bfc925e38a20384102bb0a3c30a76140275bfa281f68333`.

# Update package — 0.6.4

Prepared October 15, 2026. The runtime is the reviewed work-item-controls implementation below with manifest/package versions raised from 0.6.3 to 0.6.4. The runtime ZIP contains 16 allowlisted files and passed ZIP integrity, manifest-reference, and version checks. Its SHA-256 is `4abd89d2cde91be2985547ee8b410135a9f1f01126d98c66eede58c69cf94178`. The public privacy policy matched `docs/privacy.html` byte-for-byte on October 15, 2026.

The release CI workflow runs the full browser suite from source, builds the package, extracts the exact ZIP to a separate directory, reruns the full manifest-loaded suite against that extracted extension, and verifies the publishing helper. Use the release handoff's CI result for the final package's execution evidence. Authenticated Azure DevOps checks remain manual, as described below.

# Work-item controls verification — October 15, 2026

[Isolated Ubuntu verification](https://github.com/KyleStay/Azure-DevOps-Niceties/actions/runs/38764196198) passed with Chrome for Testing 151.0.7922.34: all 172 Node tests, syntax/public-content checks, the full manifest-loaded browser suite, allowlisted packaging, and the publishing-helper suite.

Controlled browser fixtures cover the full-width compact release layout, legacy virtual grids with native header decorations, requirement/bug category copying, and inline state editing across tables, ARIA/legacy grids and cards. State cases include explicit choice, keyboard cancellation, revision conflicts, permissions, required fields, recycled rows and opt-out restoration. Clipboard formats and real paste, selection summaries, themes and existing copy controls also pass. Disposable browser profiles are removed and supported clipboard formats restored by the harness.

Local macOS browser automation was blocked by the workspace sandbox; browser verification ran in the isolated CI environment. All work-item API writes were mocked against synthetic fixtures. Authenticated Azure DevOps workflows and the user's exact release overlay still require the procedure in `REVIEWER-TESTS.md`. No release was uploaded, published or installed. Earlier release evidence below describes the October 14 package and does not establish the current runtime ZIP hash.

# Historical release verification — 0.6.3

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
| Publishing helper | Exact ZIP, submission guide and five PNG downloads match release bytes; native/fallback copy, private-note handling and all five mobile steps passed |

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

Release copying starts enabled when no local preference exists, and preserves explicit opt-outs. Each list has compact copy icons first, selection checkboxes second, State before Title, a hidden Type column, safe Open links for linkless typed grids, Copy selected, Copy all loaded and Clear selection. Turning copying off removes the injected column and restores native table colgroups; a visible Enable copying card can re-enable it. Copy selected retains explicit reference snapshots while a mounted list is open, including temporarily unloaded rows; closing/replacing the list, changing views or turning copying off clears them. Summary totals remain limited to selected loaded rows.

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

The public privacy policy matching 0.6.3 was verified byte-for-byte against `docs/privacy.html` on October 14, 2026. It describes default-on copying and saved opt-outs. Listing, local policy and dashboard explanations now disclose selection summaries, release lists, sync preferences and displayed assignments. The store's remote-code review note explicitly describes the native page-owned theme service; store acceptance has not been established.

Provide dedicated, non-sensitive reviewer access and complete the authenticated procedure in `REVIEWER-TESTS.md` where available. Publisher account fields and Google review remain external steps. No Web Store upload or publication was performed.

Only synthetic instance URLs and sample content are committed. Disposable browser profiles are removed by the harness; supported original clipboard formats are kept in memory and restored without logging their contents. The exact ZIP run restored the clipboard and removed its profile. Recorded owned browser birth identities were verified gone after the runs; the final supported process inventory contained no Chrome for Testing processes.
