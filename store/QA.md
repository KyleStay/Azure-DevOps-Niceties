# Release verification — 0.4.0

Verified October 9, 2026 in a disposable Chrome for Testing 153.0.8010.12 profile on macOS. Ten subagents covered security/privacy, copy behavior, async behavior, native theme integration, settings, regression coverage, fixes, and store requirements. No known release-blocking finding remains in the reviewed source and tested scenarios.

## Results

| Check | Result |
| --- | --- |
| `npm test` | 61 passed, 0 failed, 0 skipped |
| `npm run check` | All runtime and browser test scripts passed syntax checks |
| `git diff --check` | Passed |
| Upload ZIP | 12 allowlisted runtime files; manifest at root; integrity and referenced-file checks passed |
| Exact upload package browser run | Passed after extracting the upload ZIP; SHA-256 below |
| Real public Azure DevOps theme | Native dark on startup and light after changing system preference, without reloading |
| Packaged content scripts | Matched Azure fixture loaded automatically; default-off consent preserved native copying, approval enabled enhanced copying |
| Browser sample scenarios | Rich/Markdown/ID/URL/branch gestures, shortcuts, parent requests/cache, parent-wait cancellation, editable/hidden-item guards, native fallback, options persistence passed |
| Security regressions | Unsafe links/Markdown HTML, mismatched IDs, synthetic gestures, cross-organization parent requests, redirects, hung requests, revocation and clipboard ordering passed |
| Theme regressions | 23 tests covering loader failures, navigation, concurrent requests, malformed definitions, forced colors, explicit high contrast and changing preferences passed |
| Images | Two actual 1280 × 800 options screenshots, 440 × 280 promotional PNG, 128 × 128 icon inspected |
| Publishing helper | Exact ZIP + four PNG downloads, native/fallback clipboard, reviewer-note privacy, and all five mobile steps passed |
| Cleanup | Test browser closed, disposable profile and extracted test package removed |

Exact tested upload ZIP SHA-256:

```text
c792052fbe6e29e6851b2ae979d8d1205938793e526591a05d840a0fc72b3779
```

Browser fixture assertions use direct injection with a simulated clipboard and parent API in addition to a packaged-content-script test. These controlled tests establish extraction, formatting and cancellation behavior; they do not establish authenticated Microsoft API compatibility. The real service theme check used a public Azure DevOps project and the packaged native theme script. Its URL and screenshots are omitted from published materials to avoid exposing instance details. Live theme checks now take a locally supplied `AZURE_NICETIES_TEST_URL`; the default browser run uses sample fixtures only.

## Changes made during release review

- Follow system light/dark appearance through Azure DevOps's native theme service, while preserving high contrast and saved account preferences.
- Add prominent data disclosure and device-local approval before enhanced copying processes work-item content.
- Validate Azure work-item destinations and IDs, escape rich/Markdown content, and keep ambiguous copy controls native.
- Keep optional parent requests within the current organization, request only required fields, reject redirects and mismatched responses, and impose one three-second deadline.
- Prevent older asynchronous copies from replacing newer native clipboard contents, and prevent competing page copy handlers from overwriting enhanced output.
- Serialize preference writes and protect settings initialization and status messages from races.
- Reset each copy control's confirmation timer so an older copy cannot clear its newer feedback.

## Checks still required before public release

Complete the authenticated checks in `REVIEWER-TESTS.md` using a non-sensitive organization. This run did not have a signed-in test organization and did not verify live private boards, pull requests, parent permissions, legacy `visualstudio.com`, Windows/Linux, or Chrome 111. The native theme service and semantic page markup are Microsoft internals and may change. Current Chrome supports the synchronous `execCommand("copy")` path; if it becomes unavailable the extension restores the native copy action.

The privacy policy is prepared for GitHub Pages at the URL in `LISTING.md`; complete the publisher's dashboard/account fields, provide reviewer access, and disclose the page-native AMD integration as explained there. Google determines store acceptance. No Chrome Web Store upload or publication was performed.

## Public-source preparation

Only synthetic Azure organization/project URLs, titles and IDs are published. Instance-identifying screenshots were removed. The old Git history and closed pull request are retained in a separate private repository; the public repository starts from a sanitized snapshot. `npm run check:public` checks publishable text files for non-sample Azure URLs and likely credentials. The privacy page is served from `docs/privacy.html`; the extension options link to its public HTTPS address.
