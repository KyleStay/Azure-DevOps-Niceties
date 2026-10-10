# Azure DevOps Niceties

A dependency-free Manifest V3 extension that follows your system theme and improves work-item copying across Azure DevOps boards, backlogs, queries, pull requests, and work-item forms.

## Automatic theme

Azure DevOps automatically uses its native dark theme when your system is in dark mode and its native light theme otherwise. It switches on page load and whenever your system appearance changes, including while a page is open. No page reload is needed, and your saved Azure DevOps account theme preference is unchanged.

High-contrast themes and forced-colors accessibility settings are preserved. Requires Chrome 111 or later. The integration uses Azure DevOps's native page service, which Microsoft may change.

## Copy behavior

Use Azure DevOps's hover-copy control on a work item:

First open the extension's toolbar menu, read the data disclosure, and turn on **Enable enhanced copying**. This approval stays on the current device. Automatic theme matching works immediately.

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

`Product Backlog Item` is shortened to `PBI`; other work-item types keep their normal name.

## Settings

Select the extension's toolbar button or its extension options to:

- Include linked parent context: `Feature 900: Parent › PBI 1234: Title`
- Customize the branch prefix (default: `feature`)

Parent information is requested only for rich or Markdown copying when the option is enabled, using the user's existing signed-in session and the same Azure DevOps organization. Requests time out after three seconds; missing or inaccessible parent information never prevents the work item itself from being copied. Parent results have a 30-second freshness window in page memory. No work-item data is saved in Chrome storage or sent to the publisher.

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

Browser verification loads the extension into a disposable headless Chromium profile, checks routed sample work-item fixtures, captures extension-options screenshots, then closes the browser and removes its profile. Set `AZURE_NICETIES_CHROME` to use another Chrome for Testing executable. Optionally set `AZURE_NICETIES_TEST_URL` locally to verify native themes on a real Azure DevOps test page; never commit the URL, credentials, or organization screenshots. Authenticated organization checks are described in [reviewer instructions](store/REVIEWER-TESTS.md). All committed work-item examples use synthetic organizations, projects, titles, and IDs.

## Prepare a Web Store release

After verification, run `npm run package`. It creates an allowlisted runtime ZIP and a complete submission kit under `release/0.4.0/`, with checksums. The listing, privacy policy, image assets, release evidence, and dashboard steps live in [store/SUBMISSION.md](store/SUBMISSION.md).

The public [privacy policy](https://kylestay.github.io/Azure-DevOps-Niceties/privacy.html) is hosted with GitHub Pages from `docs/` on `main`. When updating `store/privacy.html`, run `npm run privacy:sync` to update the published copy. Keep its Markdown version consistent. Run `npm run check:public` before publishing changes; only synthetic Azure instance URLs belong in this repository.

Azure DevOps changes its markup periodically. The content script uses semantic selectors and only takes over a copy click when it can confidently find an ID, title, and work-item link; otherwise Azure DevOps's normal action is left untouched.
