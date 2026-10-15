# Chrome Web Store submission kit

Prepared October 15, 2026, for version 0.6.9. This updates the existing extension with compact release lists, process-aware bulk copying, and inline state editing. The kit contains the runtime ZIP, current screenshots, icon, promotional image, listing, privacy answers, release notes, and reviewer procedure. See QA.md for actual checks and limits. Before submitting this version, publish the updated docs/privacy.html at the policy URL below and verify the hosted text matches. The earlier hosted policy does not yet include this version’s process-order lookup and native form-refresh details. Publisher account details, private reviewer access, distribution choices, and dashboard submission remain publisher steps. Store approval is determined by Google.

## Upload this file

Upload **`azure-devops-niceties-0.6.9.zip`** to Chrome Web Store. For an existing listing, upload it to that same item; use Add new item only for a first submission. The larger submission-kit ZIP contains this guide and store materials; do not upload that outer ZIP as the extension.

Runtime ZIP SHA-256 (integrity verified during packaging):

```text
bf3919ae1599ceed080ea1f4728478262fc682e539eb035f9b530b127d9c0d2e
```

## Included in this release

- Shared State detection now handles nested item metadata, split grid headers, alternate field-reference attributes, hidden native editors, and panels becoming visible. Release item lists, Sprints → Backlog, and product backlog use the same editing path.

- Enhanced copying and selected-item summaries start enabled, while saved opt-outs are preserved. Automatic theme matching preserves selected native dark and high-contrast themes.
- Release lists fill the overlay with aligned columns and flexible nested title text. The standalone ID column stays hidden; copied references retain IDs. Sort labels preserve Title and State mapping. The compact toolbar keeps extra copy actions and type choices in dismissible menus. Release lists have copy icons in the first column, selection checkboxes in the second, State before Title, a hidden Type column, and Select by type controls. Copy all bugs + PBIs and Copy all PBIs adapt to the project’s requirement and bug categories, including Agile stories, Basic issues, CMMI requirements, and custom types. Manual type selection remains available. Custom types and partial selections are supported; Copy all loaded still includes all types.
- Selected loaded rows show Effort and other displayed estimate totals. Copies use clean, clickable references such as `PBI 601: Improve search results`, one line per item, without extra blank lines or font styling.
- Displayed State values in identifiable work-item lists open a workflow picker. Explicit choices save immediately using normal Azure DevOps permissions and a revision check. Inline state editing has an independent local opt-out. Browser write scenarios use controlled fixtures.

## Files to use

| Item | File / source |
| --- | --- |
| Extension package | `azure-devops-niceties-0.6.9.zip` — upload this ZIP |
| Downloadable release guide | `azure-devops-niceties-0.6.9-submission-guide.md` |
| Copy-and-paste publishing helper | Open the included `publish.html` (offline; contains this exact ZIP) |
| All submission materials | `azure-devops-niceties-0.6.9-submission-kit.zip` — unpack locally; upload the inner runtime ZIP |
| Listing and privacy-tab answers | `store/LISTING.md` |
| Hosted privacy policy | https://kylestay.github.io/Azure-DevOps-Niceties/privacy.html (source: `docs/privacy.html`) |
| Reviewer's test steps | `store/REVIEWER-TESTS.md` |
| Extension icon | `store/assets/icon-128.png` (128 × 128 PNG) |
| Store screenshots and promo image | `store/assets/` (instructions in `assets/README.md`) |
| What changed / release notes | `store/RELEASE-NOTES.md` |
| Verification evidence and limits | `store/QA.md` |
| Package and asset checksums | `SHA256SUMS.txt` |

These files are provided in `release/0.6.9/` in the project. Extract the submission kit to get the upload ZIP, guide, helper, `store/` materials, and checksums together.

The upload ZIP must have `manifest.json` at its root, with packaged `src/`, `options/`, and `icons/` files present. Do not include `node_modules`, tests, Git files, account credentials, or this submission documentation in the runtime package. The release target is version 0.6.9 with Chrome 111 or later; confirm the final manifest matches. The package version is the version in the final manifest; do not upload an earlier ZIP after code changes.

The HTML helper has copy buttons for every text field, downloads for the exact ZIP, release guide and five images, a private reviewer-notes editor, and a submission checklist. It also works offline as one file. Reviewer notes remain only in the open tab and are not saved or uploaded. `npm run package` regenerates the helper from `LISTING.md`, `REVIEWER-TESTS.md`, and the current release files, and includes it at the root of the submission kit.

## Information only the publisher can supply

- A Google account registered in the [Chrome Web Store developer dashboard](https://chrome.google.com/webstore/devconsole), with Google's one-time registration fee paid if needed. Use an account you intend to maintain. See [registration instructions](https://developer.chrome.com/docs/webstore/register).
- Two-Step Verification enabled on that account. Google requires it for publishing; see [the official requirement](https://developer.chrome.com/blog/policy-update-2sv).
- Publisher name, verified contact email, and the identity/trader/address information requested for your account and target regions. Enter truthful details and complete the dashboard's verification steps. See [account setup](https://developer.chrome.com/docs/webstore/set-up-account).
- Use the hosted privacy-policy URL above and verify it loads without signing in before submitting. The public policy links to the project's support page; put the same support URL in your listing.
- A working Azure DevOps test organization/project and a dedicated reviewer account with access to non-sensitive sample work items, if reviewers cannot otherwise exercise the features. Supply credentials only through the dashboard's private Test instructions field; keep them out of this repository, the ZIP, public screenshots, and listing. Provide a usable sign-in process and required access without exposing a production account. See `REVIEWER-TESTS.md`.
- Distribution regions and visibility (Public, Unlisted, or other offered options), plus a real support URL/homepage if you choose to include them.

## Required images

Google's [image requirements](https://developer.chrome.com/docs/webstore/images) require a 128 × 128 PNG icon, a 440 × 280 small promotional image, and at least one screenshot. Screenshots must be full bleed with square corners at 1280 × 800 or 640 × 400; up to five can be submitted. A 1400 × 560 marquee image is optional.

Use assets that demonstrate the final extension. If a screenshot is a project-owned sample fixture rather than the Azure DevOps service, label it as a sample/demo. Before submitting, include a real Azure DevOps screenshot using a non-sensitive test project wherever available. Remove organization names, private titles, users, email addresses, tokens, and other sensitive material from public images. Do not represent a design mockup as a tested Azure DevOps screen.

## Submission sequence

1. Confirm the final release handoff's verification results and limitations. Load the final package locally and complete the actual Azure DevOps checks in `REVIEWER-TESTS.md`. Fixture tests alone do not establish compatibility with today's authenticated service.
2. Use the native theme-service disclosure in `LISTING.md` for the remote-code field. All extension logic is packaged; the explanation identifies the page-owned Microsoft integration so Google can assess it. No additional extension scripts are downloaded.
3. Verify the live privacy-policy URL and finish publisher account verification and Two-Step Verification. The current policy was verified against docs/privacy.html on October 15, 2026.
4. In the dashboard, open the existing Azure DevOps Niceties item, choose its package upload/update control, and upload the final runtime ZIP. Use Add new item only if this extension has never been submitted.
5. Fill the Store listing tab with `LISTING.md`, upload the icon/screenshots/small promo tile, and choose the offered category closest to Developer Tools and English language. Add genuine support/homepage URLs if available.
6. Fill the Privacy tab: single purpose, `clipboardWrite`, `storage`, site-access explanations, remote-code declaration (**Yes**, with native page-service explanation), Website content, Web history/browsing activity, and Personally identifiable information data handling, and the hosted privacy-policy URL. Review the certifications against the final code.
7. Fill Distribution with your intended audience and regions. This extension is free and requires an Azure DevOps account/project that the user already has access to.
8. Fill private Test instructions using `REVIEWER-TESTS.md` and the dedicated account/project details. Avoid inaccessible or incomplete login instructions.
9. Review every tab and submit for review. To control the release timing, choose deferred/manual publishing if offered instead of publishing automatically after approval.
10. Monitor dashboard status and the verified contact inbox for review questions. Publish after approval when ready, then install the store build and repeat its essential copy/theme checks.

Google describes ZIP upload, dashboard tabs, and review/deferred publication in [Publish in the Chrome Web Store](https://developer.chrome.com/docs/webstore/publish). Dashboard labels and account requirements may change; follow the current dashboard when completing account-specific fields.

## Do not lose the release evidence

Record the uploaded ZIP's SHA-256, version, test results, browser version, known limitations, and final image names in the release handoff. This document does not assert that browser QA or release checks have passed; use the actual final report. Any fixes after packaging require rebuilding and validating the ZIP.
