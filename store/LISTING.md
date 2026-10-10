# Chrome Web Store listing

Copy the text inside each block into the matching dashboard field. URLs, account identity, and reviewer credentials must come from the publisher; none are invented here.

## Name

```text
Azure DevOps Niceties
```

## Short description

```text
Follow your system theme and copy Azure DevOps work items as rich links, Markdown, IDs, URLs, or branch names.
```

This description is 110 characters, within Chrome's 132-character limit.

## Detailed description

```text
Make Azure DevOps more comfortable to use, with automatic system light/dark mode and better work-item copying.

FOLLOW YOUR SYSTEM THEME
Azure DevOps uses its native light or dark theme to match your operating system. The theme follows appearance changes while the page is open and after navigation, without changing your saved Azure DevOps account theme preference. High-contrast themes and forced-colors accessibility settings are preserved.

COPY WORK ITEMS IN THE FORMAT YOU NEED
Open the extension's toolbar menu and turn on “Enable enhanced copying” after reviewing the data disclosure. Then use the work item's existing copy control:
• Click: a rich linked title, such as “PBI 1234: Improve search”.
• Shift-click: a Markdown link.
• Alt-click (Option-click on Mac): the work-item ID, such as #1234.
• Ctrl-click (Command-click on Mac): the work-item URL.
• Shift+Alt-click (Shift+Option-click on Mac): a branch name, such as feature/1234-improve-search.

Keyboard shortcuts use the focused, selected, or most recently hovered work item:
• Shift+Alt+C: copy the rich linked title.
• Shift+Alt+B: copy a branch name.
Shortcuts leave editable text fields alone.

OPTIONAL PARENT CONTEXT
Turn on “Include parent context” in the extension's toolbar menu to include a linked parent alongside a rich or Markdown work-item link. Customize the branch prefix in the same menu.

WORKS WHERE YOU WORK
Designed for work-item copy controls across Azure DevOps boards, backlogs, queries, pull requests, and work-item forms on dev.azure.com and Azure DevOps's legacy visualstudio.com addresses. Requires access to an Azure DevOps organization. Azure DevOps page changes can affect compatibility; unrecognized copy controls keep their normal behavior.

DATA AND PRIVACY
Enhanced copying is off until you enable it on each device. Work-item titles, types, IDs, and URLs are then processed on your device and written to the clipboard only when you copy. With parent context enabled, the extension requests parent details from Azure DevOps using your existing signed-in session. The parent-context and branch-prefix settings use Chrome sync storage and may sync through your Google account; your copying approval stays on this device. Automatic theme matching works independently. The extension has no analytics, advertising, or developer-operated data collection server.

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
Improve the Azure DevOps work-item workflow by matching its native theme to the user's system appearance and copying work-item references in useful formats.
```

## Permissions justifications

### clipboardWrite

```text
Writes a selected Azure DevOps work item's reference to the user's clipboard after an explicit click on its copy control or a copy keyboard shortcut. Supports rich HTML/plain text, Markdown, ID, URL, and branch-name formats. The extension does not read clipboard contents.
```

### storage

```text
Stores the user's include-parent preference and branch-name prefix using chrome.storage.sync so those settings persist and can follow the user's Chrome profile across devices. Stores enhanced-copying approval only in chrome.storage.local so each device requires its own explicit approval. Work-item data is not saved in Chrome storage.
```

### Website access / content-script matches

```text
Runs on https://dev.azure.com/* and https://*.visualstudio.com/* to use Azure DevOps's native theme service and, after the user enables enhanced copying, to find work-item IDs, titles, types, links, and native copy controls. The visualstudio.com wildcard covers organization-specific legacy Azure DevOps hosts and may also match other Microsoft subdomains; copying requires a recognized Azure work-item control and theme matching requires Azure DevOps's platform service. When parent context is enabled and a rich or Markdown copy is requested, the extension fetches child relations and parent details from the same Azure DevOps organization using the user's existing session.
```

The manifest grants these sites through content-script match patterns; it does not request `<all_urls>`, `tabs`, `history`, `cookies`, or `clipboardRead`.

## Data-use declarations

Select **Website content** and **Web history / browsing activity** (use the equivalent current dashboard labels). Work-item data and the current work-item URL are handled locally even though they are not sent to a developer server. Do not claim “no user data handled.” The Web history disclosure describes Azure DevOps URLs needed for copying; the extension does not read Chrome's history database or track browsing across sites. See the [official local-processing FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq).

The extension does not intentionally read identity, passwords, authentication tokens, payment data, health data, personal communications, or location. Azure DevOps content may itself contain sensitive information; that content remains covered by the Website content disclosure. Chrome supplies existing session credentials to Azure DevOps requests; the extension does not extract or retain them.

Certify the dashboard statements that data is not sold or transferred for unrelated purposes, is not used for lending/creditworthiness, and is used only for the disclosed purpose. These certifications must remain accurate for future versions.

## Remote-code review note

All extension JavaScript and CSS ship in the ZIP. There are no remote extension scripts, CDN dependencies, `eval`, or remotely supplied extension logic. However, `src/theme.js` runs in the page's MAIN world and calls Azure DevOps's own AMD loader, `window.require(["VSS/Platform/Context"], ...)`, then its `IVssThemeService` and available-themes data provider. The page's loader may obtain its native module from Microsoft.

For the dashboard's remote-code question, choose **Yes** conservatively and provide the factual explanation below. The native page-owned AMD integration is the reason for this disclosure; the extension's own code remains packaged. Do not describe it as “all JavaScript executed by the page is packaged in this extension.” The store's [remote-code guidance](https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code) and [Manifest V3 requirements](https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements) define the restriction broadly. The requirements discuss exceptions for contexts isolated from extension APIs; whether this MAIN-world native service integration qualifies is an inference that reviewers must assess. Store acceptance has not been established, and a declaration does not itself exempt prohibited remote code.

Suggested factual explanation:

```text
The extension bundles all of its own scripts. Its packaged MAIN-world theme script invokes Azure DevOps's existing native AMD Context module and theme service to apply the site's native light/dark themes. Azure DevOps may load its native module through its own loader. The extension does not download or evaluate remotely hosted extension scripts, configuration logic, or JavaScript responses. Optional work-item requests return JSON data only. Please see src/theme.js and the supplied reviewer instructions for this page-service integration.
```
