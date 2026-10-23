# Chrome Web Store listing

Copy the text inside each block into the matching dashboard field. Keep privacy explanations concise and factual, below the 1,000-character limit; use only the space needed. URLs, account identity, and reviewer credentials must come from the publisher; none are invented here.

## Name

```text
Azure DevOps Niceties
```

## Short description

```text
Copy Azure DevOps work items, edit states inline, summarize selected estimates, and follow your system theme.
```

This description is 109 characters, within Chrome's 132-character limit.

## Detailed description

```text
Make Azure DevOps more comfortable to use, with clean work-item copying, inline state editing, selection totals, and automatic system light/dark mode.

FOLLOW YOUR SYSTEM THEME
Automatic is the default setting. If Azure DevOps starts with its standard light/default theme, it follows your operating system's appearance using native light and dark themes. Selected dark and high-contrast themes are preserved. The extension menu offers Automatic, On, and Off; saved On/Off choices override the automatic choice. Theme changes follow system appearance while the page is open and after navigation, without changing your saved Azure DevOps account theme preference. High-contrast themes and forced-colors accessibility settings are always preserved.

COPY WORK ITEMS IN THE FORMAT YOU NEED
Enhanced copying starts enabled. You can turn off “Enable enhanced copying” in the extension menu; saved opt-outs are preserved. Use the work item's existing copy control:
• Click: a rich linked title, such as “PBI 1234: Improve search”.
• Shift-click: a Markdown link.
• Alt-click (Option-click on Mac): the work-item ID, such as #1234.
• Ctrl-click (Command-click on Mac): the work-item URL.
• Shift+Alt-click (Shift+Option-click on Mac): a branch name, such as feature/1234-improve-search.

Keyboard shortcuts use the focused, selected, or most recently hovered work item:
• Shift+Alt+C: copy the rich linked title.
• Shift+Alt+B: copy a branch name.
Shortcuts leave editable text fields alone.

CLEAN COPIES AND RELEASE-STAGE LISTS
Individual references are trimmed to one line. Rich copies use clickable links without font styling or paragraph wrappers. Product Backlog Item, User Story, Test Case, Test Plan, and Test Suite shorten to PBI, US, TC, TP, and TS; Bug, Task, Feature, and Epic keep their names.

In a release’s stage Work items view, compact copy icons in the first column and checkboxes in the second, with State before Title and the Type column hidden, let you choose and copy references. Use the select-all checkbox in the selection header to select loaded items, then Copy selected (N), Copy all loaded (N), or Clear selection above the list. Linkless rows gain Open links. If copying is disabled, the release-page Enable copying card explains the data use and enables these controls.

Copy all bugs + PBIs and Copy all PBIs offer direct copying without changing selection. The project’s categories adapt these shortcuts to Agile stories, Basic issues, CMMI requirements, and custom backlog types.

Copy as table offers a linked type/ID/title label such as PBI 123 Improve search, State, and optional fields you can add or remove, including custom QA assignment fields. Choose all loaded or selected items, then paste into Excel for the web. Field choices and order are remembered locally for each organization. Saved work-item values are read on demand from your organization; blank fields stay blank. The displayed release list also shows IDs beside titles without changing copied labels.

Use Select by type to choose Bug, PBI, or any other displayed type while leaving Tasks unselected. Check a type to select its loaded items; uncheck it to remove its selected references, including temporarily unloaded ones. Type checkboxes reflect individual row selections and support partial selection, standard abbreviations, and custom types. Counts show selected/available references. Copy selected follows your choices; Copy all loaded still includes every type.

Copy selected keeps references chosen while that list is open, including rows temporarily unloaded or filtered. Closing/replacing the list or changing views clears selections. Copy all covers visible loaded rows. Duplicate items count once. Ctrl/Command+C on the extension’s selection controls or Shift+Alt+C inside the list copies the selection; native copying and text editing elsewhere retain their behavior. The same click modifiers select Markdown, IDs, URLs, or branch names. List copying omits parent context; individual Copy follows the parent-context preference.

EDIT STATES WITHOUT OPENING EVERY ITEM
Click a displayed State to choose a workflow state and save it immediately. Works with identifiable work items in tables, queries, Sprints → Backlog, product backlogs, release item lists, and cards, including custom processes. Normal Azure DevOps permissions and workflow rules apply. Conflicts and required fields show an error with a link to the item; saves are never retried automatically. Existing native editors remain available. State text uses its available width, with interaction cues on hover or keyboard focus. Choices use the project’s workflow order when available. A matching older form is refreshed through the native form service when supported and free of unsaved edits. Inline state editing can be turned off independently in the extension menu.

SUMMARIZE SELECTED WORK ITEMS
Selection summaries are on by default. Turn off “Enable selection summary” independently in the extension menu to opt out; your choice is saved on this device. Select loaded rows in a query, backlog, or other work-item list to see selected count, separate totals for displayed Effort, Story Points, and Size, counts by type and state, and unassigned count. Add estimate columns to see totals. Missing estimates are identified; zero remains a valid estimate. The panel updates with your selection and can be collapsed. It uses displayed rows only and makes no extra requests.

OPTIONAL PARENT CONTEXT
Turn on “Include parent context” in the extension's toolbar menu to include a linked parent alongside a rich or Markdown work-item link. Customize the branch prefix in the same menu.

WORKS WHERE YOU WORK
Designed for work-item copy controls across Azure DevOps boards, backlogs, queries, pull requests, and work-item forms on dev.azure.com and Azure DevOps's legacy visualstudio.com addresses. Requires access to an Azure DevOps organization. Azure DevOps page changes can affect compatibility; unrecognized copy controls keep their normal behavior.

DATA AND PRIVACY
Work-item information is processed in the open page for copying, selection summaries, and State editing. This can include names or email addresses in assignments and chosen export fields. Copy actions write to your clipboard; the extension does not read it.

Requests for workflow metadata, project categories, missing titles, table fields, and optional parent details stay within your Azure DevOps organization and use your existing signed-in session. Choosing a State saves that change immediately with normal permissions and revision checks.

Theme, parent-context, and branch-prefix settings may sync through your Google account. Feature switches and export field choices, including the organization identifier, stay in local Chrome storage. Work-item content is not saved there or sent to the developer. There is no analytics or advertising. Features can be turned off in the extension menu. See the privacy policy for details.

This is an independent extension and is not affiliated with or endorsed by Microsoft.
```

## Other listing fields

| Field | Value |
| --- | --- |
| Language | English |
| Category | Developer Tools, or the closest developer-tool category offered by the dashboard |
| Pricing | Free |
| Mature content | No |
| Homepage | https://kylestay.github.io/Azure-DevOps-Niceties/ |
| Support URL | https://github.com/KyleStay/Azure-DevOps-Niceties/issues |
| Privacy policy URL | https://kylestay.github.io/Azure-DevOps-Niceties/privacy.html |

## Single purpose

```text
Improve Azure DevOps work-item workflows with reference copying, inline State editing, selection summaries, and system theme matching.
```

## Permissions justifications

### clipboardWrite

```text
Copies work-item links, IDs, branch names, or tables to the clipboard after a copy click or keyboard shortcut. The extension does not read the clipboard.
```

### storage

```text
Saves theme, parent-context, and branch-prefix settings through Chrome sync, which may use your Google account. Saves feature switches and export field choices locally on this device. Export choices include the organization identifier and ordered field reference names. Work-item content is not saved in Chrome storage.
```

### Host permission justification

```text
Access to https://dev.azure.com/* and https://*.visualstudio.com/* enables copying, selection summaries, State editing, and native themes. The extension reads displayed work-item data and requests metadata, missing titles, chosen export fields, and optional parent details from the same Azure DevOps organization using your signed-in session. Choosing a State immediately saves that change using normal permissions and revision checks. Work-item content is not sent to the developer. The visualstudio.com wildcard supports legacy organization addresses and can also match other Microsoft subdomains; features require recognized Azure DevOps controls or services.
```

Use this explanation in the Chrome Web Store privacy tab's **Host permission justification** field. The manifest grants site access through `content_scripts.matches`, without a separate `host_permissions` entry. Site access still requires this explanation. The extension does not request `<all_urls>`, `tabs`, `history`, `cookies`, or `clipboardRead`.

## Data-use declarations

Select **Website content**, **Web history / browsing activity**, and **Personally identifiable information** (use the equivalent current dashboard labels). Work-item data and the current work-item URL are handled locally even though they are not sent to a developer server. Do not claim “no user data handled.” The Web history disclosure describes Azure DevOps URLs needed for copying; the extension does not read Chrome's history database or track browsing across sites. See the [official local-processing FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq).

Assignments and chosen export fields may contain names or email addresses. Selection summaries use assignments to count unassigned rows; table copies include the fields the user chooses. These values are not sent to the developer. This is the reason for the Personally identifiable information disclosure.

The extension does not intentionally read passwords, authentication tokens, payment data, health data, personal communications, or location. Azure DevOps content may itself contain sensitive information; that content remains covered by the Website content disclosure. Chrome supplies existing session credentials to Azure DevOps requests; the extension does not extract or retain them.

Certify the dashboard statements that data is not sold or transferred for unrelated purposes, is not used for lending/creditworthiness, and is used only for the disclosed purpose. These certifications must remain accurate for future versions.

## Remote-code review note

All extension JavaScript and CSS ship in the ZIP. There are no remote extension scripts, CDN dependencies, `eval`, or remotely supplied extension logic. However, `src/theme.js` runs in the page's MAIN world and calls Azure DevOps's own module loader (the current synchronous `window.require("VSS/Platform/Context")` registry, with AMD callbacks supported on older pages), then its `IVssThemeService` and available-themes data provider. The bundled src/state-form.js also uses the page-owned TFS/WorkItemTracking/Services form API to refresh a matching older clean form after an inline save. The page’s loader may obtain its native modules from Microsoft.

For the dashboard's remote-code question, choose **Yes** conservatively and provide the factual explanation below. The native page-owned module integration is the reason for this disclosure; the extension's own code remains packaged. Do not describe it as “all JavaScript executed by the page is packaged in this extension.” The store's [remote-code guidance](https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code) and [Manifest V3 requirements](https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements) define the restriction broadly. The requirements discuss exceptions for contexts isolated from extension APIs; whether this MAIN-world native service integration qualifies is an inference that reviewers must assess. Store acceptance has not been established, and a declaration does not itself exempt prohibited remote code.

Suggested factual explanation:

```text
All extension scripts are packaged. Theme matching and form refresh call Azure DevOps's existing page services; its loader may fetch Microsoft's native modules. The extension does not fetch or evaluate remote extension code. Work-item and workflow requests return JSON. See src/theme.js and src/state-form.js.
```
