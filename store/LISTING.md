# Chrome Web Store listing

Copy the text inside each block into the matching dashboard field. URLs, account identity, and reviewer credentials must come from the publisher; none are invented here.

## Name

```text
Azure DevOps Niceties
```

## Short description

```text
Copy clean Azure DevOps work-item links and release-stage lists, total selected estimates, and follow your system theme.
```

This description is 120 characters, within Chrome's 132-character limit.

## Detailed description

```text
Make Azure DevOps more comfortable to use, with clean work-item copying, selection totals, and automatic system light/dark mode.

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

In a release’s stage Work items view, a dedicated first checkbox column and a final Copy column with individual buttons let you choose and copy references. Use the select-all checkbox in the first column header to select loaded items, then Copy selected (N), Copy all loaded (N), or Clear selection above the list. Linkless rows gain Open links. If copying is disabled, the release-page Enable copying card explains the data use and enables these controls.

Copy selected keeps references chosen while that list is open, including rows temporarily unloaded or filtered. Closing/replacing the list or changing views clears selections. Copy all covers visible loaded rows. Duplicate items count once. Ctrl/Command+C on the extension’s selection controls or Shift+Alt+C inside the list copies the selection; native copying and text editing elsewhere retain their behavior. The same click modifiers select Markdown, IDs, URLs, or branch names. List copying omits parent context; individual Copy follows the parent-context preference.

SUMMARIZE SELECTED WORK ITEMS
Selection summaries are on by default. Turn off “Enable selection summary” independently in the extension menu to opt out; your choice is saved on this device. Select loaded rows in a query, backlog, or other work-item list to see selected count, separate totals for displayed Effort, Story Points, and Size, counts by type and state, and unassigned count. Add estimate columns to see totals. Missing estimates are identified; zero remains a valid estimate. The panel updates with your selection and can be collapsed. It uses displayed rows only and makes no extra requests.

OPTIONAL PARENT CONTEXT
Turn on “Include parent context” in the extension's toolbar menu to include a linked parent alongside a rich or Markdown work-item link. Customize the branch prefix in the same menu.

WORKS WHERE YOU WORK
Designed for work-item copy controls across Azure DevOps boards, backlogs, queries, pull requests, and work-item forms on dev.azure.com and Azure DevOps's legacy visualstudio.com addresses. Requires access to an Azure DevOps organization. Azure DevOps page changes can affect compatibility; unrecognized copy controls keep their normal behavior.

DATA AND PRIVACY
Enhanced copying and selection summaries default on and respect saved opt-outs on each device. Work-item titles, types, IDs, and URLs are processed while copying is enabled on your device and written to the clipboard only when you copy. With parent context enabled, the extension requests parent details from Azure DevOps using your existing signed-in session. Selection summaries separately read displayed estimates, types, states, and assignments on your device. System-theme, parent-context, and branch-prefix preferences use Chrome sync storage and may sync through your Google account; the copying and summary switches stay on this device. Work-item content is not saved in Chrome storage. Automatic theme matching works independently. The extension has no analytics, advertising, or developer-operated data collection server.

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
Improve the Azure DevOps work-item workflow with useful reference copying, selected-item summaries, and native themes that follow system appearance.
```

## Permissions justifications

### clipboardWrite

```text
Writes an Azure DevOps work-item reference or a release-stage list of references to the user's clipboard after an explicit click on a native or extension-provided item/list copy control or a copy keyboard shortcut. Supports rich HTML/plain text, Markdown, ID, URL, and branch-name formats. The extension does not read clipboard contents.
```

### storage

```text
Stores the user's system-theme-sync preference, include-parent preference, and branch-name prefix using chrome.storage.sync so those settings persist and can follow the user's Chrome profile across devices. Stores the default-on enhanced-copying and selection-summary preferences only in chrome.storage.local. Both features start enabled unless the user saves a local opt-out. Work-item data is not saved in Chrome storage.
```

### Website access / content-script matches

```text
Runs on https://dev.azure.com/* and https://*.visualstudio.com/* to use Azure DevOps's native theme service and, when enhanced copying is enabled, to find work-item IDs, titles, types, links, native copy controls, and loaded release-stage lists, including typed grid cells without native item links. Default-on selection summaries read displayed selected rows, estimates, types, states, and assignments locally without additional requests. The visualstudio.com wildcard covers organization-specific legacy Azure DevOps hosts and may also match other Microsoft subdomains; copying requires a recognized Azure work-item control and theme matching requires Azure DevOps's platform service. When parent context is enabled and a rich or Markdown copy is requested, the extension fetches child relations and parent details from the same Azure DevOps organization using the user's existing session.
```

The manifest grants these sites through content-script match patterns; it does not request `<all_urls>`, `tabs`, `history`, `cookies`, or `clipboardRead`.

## Data-use declarations

Select **Website content**, **Web history / browsing activity**, and **Personally identifiable information** (use the equivalent current dashboard labels). Work-item data and the current work-item URL are handled locally even though they are not sent to a developer server. Do not claim “no user data handled.” The Web history disclosure describes Azure DevOps URLs needed for copying; the extension does not read Chrome's history database or track browsing across sites. See the [official local-processing FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq).

Displayed assignments may include names or email addresses. These are read locally only to distinguish assigned from unassigned rows for selection summaries; the extension does not build identity profiles or send assignments to the developer. This is the reason for the Personally identifiable information disclosure.

The extension does not intentionally read passwords, authentication tokens, payment data, health data, personal communications, or location. Azure DevOps content may itself contain sensitive information; that content remains covered by the Website content disclosure. Chrome supplies existing session credentials to Azure DevOps requests; the extension does not extract or retain them.

Certify the dashboard statements that data is not sold or transferred for unrelated purposes, is not used for lending/creditworthiness, and is used only for the disclosed purpose. These certifications must remain accurate for future versions.

## Remote-code review note

All extension JavaScript and CSS ship in the ZIP. There are no remote extension scripts, CDN dependencies, `eval`, or remotely supplied extension logic. However, `src/theme.js` runs in the page's MAIN world and calls Azure DevOps's own module loader (the current synchronous `window.require("VSS/Platform/Context")` registry, with AMD callbacks supported on older pages), then its `IVssThemeService` and available-themes data provider. The page's loader may obtain its native module from Microsoft.

For the dashboard's remote-code question, choose **Yes** conservatively and provide the factual explanation below. The native page-owned module integration is the reason for this disclosure; the extension's own code remains packaged. Do not describe it as “all JavaScript executed by the page is packaged in this extension.” The store's [remote-code guidance](https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code) and [Manifest V3 requirements](https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements) define the restriction broadly. The requirements discuss exceptions for contexts isolated from extension APIs; whether this MAIN-world native service integration qualifies is an inference that reviewers must assess. Store acceptance has not been established, and a declaration does not itself exempt prohibited remote code.

Suggested factual explanation:

```text
The extension bundles all of its own scripts. Its packaged MAIN-world theme script invokes Azure DevOps's existing native Context module and theme service to apply the site's native light/dark themes. Azure DevOps may load its native module through its own loader. The extension does not download or evaluate remotely hosted extension scripts, configuration logic, or JavaScript responses. Optional work-item requests return JSON data only. Please see src/theme.js and the supplied reviewer instructions for this page-service integration.
```
