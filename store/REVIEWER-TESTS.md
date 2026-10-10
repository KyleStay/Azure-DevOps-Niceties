# Reviewer test instructions

This document is a test procedure, not a claim that the tests have already passed. Paste the relevant procedure into the dashboard's private **Test instructions** field and add the publisher's real test access details there.

## Access the publisher must provide privately

- A test Azure DevOps organization and project URL.
- A dedicated test account, password or other supported login instructions, and any required access steps.
- A sample work-item URL with known ID, title, and type; preferably a Product Backlog Item.
- A sample parent and child relation, such as Feature 900 “Search improvements” → PBI 1234 “Improve search”. Use actual accessible IDs instead of these examples.
- Where to find a board, backlog, query result, and pull request with linked work items in that project, so all claimed surfaces can be checked.

Keep credentials out of public documents. Provide a reviewer account with sample data and no access to sensitive production projects. The extension does not create an Azure DevOps account or bypass Azure DevOps permissions.

## Essential procedure

1. Install the extension, sign in to the provided Azure DevOps test project, and open the provided work item or board. The extension runs on `https://dev.azure.com/*` and organization-specific `https://*.visualstudio.com/*` addresses.
2. Before enabling copying, verify Azure DevOps's existing copy action still works. Open the extension's toolbar menu, review the disclosure, and turn on **Enable enhanced copying**. The copy approval is local to this device; parent-context and branch-prefix settings may sync. Put the operating system in light mode. Azure DevOps should use its native light theme. Switch the operating system to dark mode with the Azure DevOps page still open: it should change to its native dark theme. Switch back and navigate within Azure DevOps; it should continue following system appearance. Check an editor/form as well as the surrounding shell. The extension applies the current page's theme without saving a new account preference. Native high-contrast themes and forced-colors settings should be preserved.
3. Hover the sample work item and click its existing work-item copy control. Paste into a rich-text editor: the whole label, such as `PBI 1234: Improve search`, should be linked to the work item. Paste into a plain-text editor: its readable label should remain.
4. Repeat the same control with Shift held and paste into a plain-text editor: expect a Markdown link. Hold Alt (Option on Mac): expect `#1234`. Hold Ctrl (Command on Mac): expect the URL. Hold Shift+Alt (Shift+Option on Mac): expect `feature/1234-improve-search`, using the actual test item's ID and title.
5. Focus/select or hover the sample work item, then use `Shift+Alt+C` and `Shift+Alt+B`: expect the rich linked title and branch name. Focus an editable title/text field and type or use the same keys: the extension should leave that field's editing behavior alone.
6. Open the extension's toolbar menu. Enable **Include parent context**, then repeat rich and Markdown copy on the child item. Expect the linked parent before the child, separated by `›`. Change the branch prefix to `bugfix`, then copy a branch name: expect the new prefix. Close/reopen the menu and verify settings persist.
7. Disable **Include parent context** and copy again: expect only the child. A missing or inaccessible parent should also allow the child reference to copy. A slow parent lookup should time out after the extension's 3-second total lookup budget and still copy the child. Withdraw **Enable enhanced copying** approval and confirm subsequent copy actions return to Azure DevOps behavior, then enable it again for remaining checks.
8. Repeat basic copy on the board, backlog, query result, work-item form, and a pull request's linked work-item list. An unrelated copy control, such as a Git branch name or field value, must retain its normal behavior. When a work item cannot be identified confidently, the extension leaves that native control alone.

Clipboard actions require the page to be active and the copy gesture/shortcut to be performed by the reviewer. Pasting into a plain-text editor will not show rich HTML links; use a rich-text editor for that check.

## Implementation notes for reviewers

The package is Manifest V3 with no background service or analytics. `src/work-item.js` formats references, `src/content.js` enhances recognized copy gestures and optionally fetches Azure DevOps JSON parent data, and the options page saves parent-context and branch-prefix preferences through `chrome.storage.sync`, plus enhanced-copying approval through `chrome.storage.local`. Without approval, enhanced copying and work-item processing remain disabled while theme matching continues.

`src/theme.js` is packaged with the extension and runs in the page's MAIN world. It uses Azure DevOps's own AMD loader to access `VSS/Platform/Context`, obtains `IVssThemeService`, loads the site's available-themes data provider if required, and applies a known native light/dark theme ID. Azure DevOps's loader may load its own native module from Microsoft. The extension does not fetch JavaScript for evaluation or download replacement extension logic. This integration is explicitly disclosed for remote-code review; it is not a claim of a policy exemption or prior store approval.

The `clipboardWrite` permission writes a reference after a user gesture. `storage` preserves preferences, which may sync through Google. Site matching is limited to the Azure DevOps cloud domains above. The extension does not read clipboard contents or Chrome's browsing-history database.
