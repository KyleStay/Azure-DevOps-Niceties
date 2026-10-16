# Azure DevOps Niceties

A dependency-free Manifest V3 extension that follows your system theme and improves work-item copying across Azure DevOps boards, backlogs, queries, pull requests, and work-item forms.

## Optional system theme

**Automatic** is the default theme setting. When Azure DevOps starts with its standard light/default theme, the extension follows your system's light or dark appearance. Selected dark and high-contrast themes are preserved. The extension remembers its own theme changes so applying dark mode does not stop subsequent system syncing. Native theme changes and recreated services are rechecked.

Choose **On** in **Sync theme with system** to explicitly follow system appearance, or **Off** to stop automatic changes. Choose **Automatic** to restore the default behavior. Existing saved On/Off choices are preserved. Changes apply to open tabs, and your saved Azure DevOps account theme preference is unchanged.

Startup waits for the saved setting and the native theme service. Visible tabs are checked periodically to recover from delayed scripts, transient failures, and navigation that resets the theme. Loads time out after five seconds, failures retry with backoff, and periodic checks stop when syncing is off or the tab is hidden.

High-contrast themes and forced-colors accessibility settings are preserved. Requires Chrome 111 or later. The integration uses Azure DevOps's native page service, which Microsoft may change.

## Copy behavior

Use Azure DevOps's hover-copy control on a work item:

Enhanced copying and selection summaries start enabled. Turn either feature off in the extension menu to opt out; your saved choices stay on this device. Automatic theme matching preserves selected native dark and high-contrast themes.

| Gesture | Clipboard output |
| --- | --- |
| Click | Rich text with the entire `PBI 1234: Title` label linked |
| Shift-click | `[PBI 1234: Title](https://dev.azure.com/...)` |
| Option/Alt-click | `#1234` |
| Command/Ctrl-click | Bare work-item URL |
| Shift+Option/Alt-click | `feature/1234-title` branch name |

Keyboard shortcuts operate on the focused, selected, or most recently hovered work item:

- `Shift+Alt+C`: copy the rich linked title
- `Shift+Alt+B`: copy the branch name

`Product Backlog Item`, `User Story`, `Test Case`, `Test Plan`, and `Test Suite` shorten to `PBI`, `US`, `TC`, `TP`, and `TS`. Short types such as Bug, Task, Feature, and Epic keep their names.

Individual references trim surrounding whitespace and collapse embedded newlines, tabs, and repeated spaces to one line. Rich copies contain inline links without font styling or paragraph wrappers, so the destination controls the font.

## Release-stage work-item lists

Open a release → stage → Work items. If copying is disabled, a visible **Enable copying** card explains the local data use and enables the feature without leaving the page. The list fills the panel with compact copy icons in the first column, checkboxes in the second, and State before a flexible Title column. The Type column is hidden; its values remain available for filtering and copied references. The standalone ID column stays hidden to preserve State and Title space; copied references still include IDs. Native title wrappers stretch with the column, and decorated headers retain their field mapping. Bolt presentation spacers consume no width or field indices. If a native title link is empty, a bounded same-organization read fetches only missing IDs/titles and displays them in an extension-owned link. Native links and work-item fields are unchanged; copying incomplete references stays disabled if a title is unavailable. Linkless rows also gain a safe **Open** link.

Use the select-all checkbox in the selection column header to select loaded items. Above the list, use **Copy selected (N)**, **Copy all loaded (N)**, and **Clear selection**. Selected references remain available while that list is open, including temporarily unloaded rows; closing/replacing the list or changing views clears them. Filtering or updating visible rows refreshes their references. Duplicate representations of one item select and copy once.

Under **More copy options**, **Copy all bugs + PBIs** and **Copy all PBIs** copy matching loaded, visible items without changing your selection. Names and membership follow the project’s Azure DevOps work-item categories: Scrum PBIs, Agile stories, Basic issues, CMMI requirements, and custom backlog or bug types. Tasks and unrelated categories are excluded. The extension reads project category names from the same signed-in Azure DevOps organization when the list opens. If categories cannot load, use the type checkboxes instead.

Open **Select by type** to select Bugs and PBIs while leaving Tasks unselected, or choose any other displayed type. Type checkboxes update when you select individual rows and show partial selections. Counts show selected/available references, including selections retained while rows are unloaded. Checking a type selects its loaded items; unchecking removes its selected references, including unloaded ones. Use **Copy selected** for your choices; **Copy all loaded** still includes every type. Standard long names and abbreviations share a choice, and custom work-item types are supported.

Use Ctrl/Command+C while focused on the extension's selection controls, or Shift+Alt+C inside the list, to copy selected references. Normal text editing and native copy handlers remain available elsewhere. Click modifiers select Markdown, IDs, URLs, or branch names. List copies omit parent context; individual Copy buttons follow the normal parent-context preference.

References use one clean linked `TYPE ID: Title` per line with no extra blank lines or font styles. Copy all covers currently loaded, visible rows. The Effort summary follows selected loaded rows, and appears in the stage sheet when the list is in a panel. Project category names stay in page memory while the list is open; work-item data is not saved.

## Change a work-item state from a list

Click a displayed **State** in a table, query, Sprints → Backlog, product backlog, release list, or work-item card to open its state picker. Choosing a different state saves it immediately to Azure DevOps using your signed-in session. Workflow choices come from the item’s actual project and type, including custom processes. Opening the picker, moving keyboard focus, or pressing Escape makes no changes.

The extension checks the work-item revision before saving and respects Azure DevOps permissions and workflow rules. Conflicting edits require reopening the picker; transitions needing additional fields show an error and an **Open work item** link. An unconfirmed save is never retried automatically. Confirmed changes update other displayed copies of that item. State text has no persistent arrow or reserved indicator width; hover and keyboard focus reveal interactivity. Choices use the project’s process state order when readable, with a short optional lookup and a fallback to type-definition order. A matching older native item form is refreshed when its form service is available and it reports no unsaved edits. Synchronization never sets fields, saves the form, or reloads the page; on hosts without that service, use the form’s own Refresh command. Existing native state editors, ambiguous rows, and rows with unsaved input are left alone. Lists must expose an identifiable work-item ID and a readable state field; state editing makes no work-item API calls until a picker is opened. Enhanced release copying separately reads missing titles as described above.

**Enable inline state editing** starts on and can be turned off independently in the extension menu. This removes the added controls and restores plain state text.

## Settings

Select the extension's toolbar button or its extension options to:

- Choose Automatic, On, or Off for system theme syncing
- Include linked parent context: `Feature 900: Parent › PBI 1234: Title`
- Customize the branch prefix (default: `feature`)

Parent information is requested only for rich or Markdown copying when the option is enabled, using the user's existing signed-in session and the same Azure DevOps organization. Requests time out after three seconds; missing or inaccessible parent information never prevents the work item itself from being copied. Parent results have a 30-second freshness window in page memory. Turning enhanced copying off cancels pending parent requests and clears cached parent details. No work-item data is saved in Chrome storage or sent to the publisher.

## Selection summary

Selection summaries are on by default. Select work items in queries, backlogs, or other work-item lists. A collapsible panel at the bottom right shows selected item count; separate totals for displayed **Effort**, **Story Points**, and **Size** fields; counts by type and state; and unassigned count when assignments are displayed. Turn off **Enable selection summary** in the extension's toolbar menu to opt out; that choice is saved on this device. The switch is independent of enhanced copying.

Add estimate columns to the list to see their totals. Blank or invalid estimates are marked missing, rather than counted as zero; zero is a valid estimate. Duplicate rows for the same item count once. The panel updates as selection or displayed fields change and disappears when selection is cleared.

The summary covers selected rows currently loaded in the page. Hidden rows and rows unloaded by virtual scrolling are excluded. It reads displayed data locally, makes no additional requests, and saves no work-item data. Effort, Story Points, and Size stay separate because they can use different units.

## Install locally

1. Open `chrome://extensions` in a Chromium browser.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select this directory.

After changing the source, use the extension card's reload button to load the new version.

## Test

```sh
npm install
npm test
npm run check
npx playwright install chromium
npm run test:browser
```

The repository pins its test dependency in `package.json`; no machine-specific runtime paths are required.

Browser verification loads the extension into a disposable headless Chromium profile, checks routed sample work-item and native theme-service fixtures (including delayed and hung loads, live setting changes, opt-out on startup, and navigation resets), captures extension-options screenshots, then closes the browser and removes its profile. Set `AZURE_NICETIES_CHROME` to use another Chrome for Testing executable. Optionally set `AZURE_NICETIES_TEST_URL` locally to verify native themes on a real Azure DevOps test page; never commit the URL, credentials, or organization screenshots. Authenticated organization checks are described in [reviewer instructions](store/REVIEWER-TESTS.md). All committed work-item examples use synthetic organizations, projects, titles, and IDs.

## Prepare a Web Store release

After verification, run `npm run package`. It creates an allowlisted runtime ZIP and a complete submission kit under `release/0.6.10/`, with checksums and a standalone submission guide. The listing, privacy policy, image assets, release evidence, and dashboard steps live in [store/SUBMISSION.md](store/SUBMISSION.md).

Open `release/0.6.10/publish.html` or the [publishing helper](https://kylestay.github.io/Azure-DevOps-Niceties/publish.html) for copy-and-paste fields and one-click ZIP, submission-guide, and image downloads. This standalone file is generated from the reviewed documents and works offline. Run `npm run test:publisher` to verify its clipboard actions, downloads, private-note handling, and mobile layout in disposable Chromium.

The public [privacy policy](https://kylestay.github.io/Azure-DevOps-Niceties/privacy.html) is hosted with GitHub Pages from `docs/` on `main`. When updating `store/privacy.html`, run `npm run privacy:sync` to update the published copy. Keep its Markdown version consistent. Run `npm run check:public` before publishing changes; only synthetic Azure instance URLs belong in this repository.

Azure DevOps changes its markup periodically. The content script uses semantic selectors and only takes over a copy click when it can confidently find an ID, title, and work-item link; otherwise Azure DevOps's normal action is left untouched.
