# Chrome Web Store submission kit

Prepared October 14, 2026, for version 0.6.2. The runtime ZIP, three screenshots, icon, promotional image, listing, privacy answers, and reviewer procedure are prepared and tested. Publisher verification, private reviewer access, the public policy update, and dashboard submission remain separate steps. Store approval is determined by Google.

## Files to use

| Item | File / source |
| --- | --- |
| Extension package | `release/0.6.2/azure-devops-niceties-0.6.2.zip` — upload this ZIP |
| Copy-and-paste publishing helper | Open `release/0.6.2/publish.html` or https://kylestay.github.io/Azure-DevOps-Niceties/publish.html |
| All submission materials | `release/0.6.2/azure-devops-niceties-0.6.2-submission-kit.zip` — unpack locally; upload the inner runtime ZIP |
| Listing and privacy-tab answers | `store/LISTING.md` |
| Hosted privacy policy | https://kylestay.github.io/Azure-DevOps-Niceties/privacy.html (source: `docs/privacy.html`) |
| Reviewer's test steps | `store/REVIEWER-TESTS.md` |
| Extension icon | `store/assets/icon-128.png` (128 × 128 PNG) |
| Store screenshots and promo image | `store/assets/` (instructions in `assets/README.md`) |
| Verification evidence and limits | `store/QA.md` |
| Package and asset checksums | `release/0.6.2/SHA256SUMS.txt` |

The upload ZIP must have `manifest.json` at its root, with packaged `src/`, `options/`, and `icons/` files present. Do not include `node_modules`, tests, Git files, account credentials, or this submission documentation in the runtime package. The release target is version 0.6.2 with Chrome 111 or later; confirm the final manifest matches. The package version is the version in the final manifest; do not upload an earlier ZIP after code changes.

The HTML helper has copy buttons for every text field, downloads for the exact ZIP and five images, a private reviewer-notes editor, and a submission checklist. It also works offline as one file. Reviewer notes remain only in the open tab and are not saved or uploaded. `npm run package` regenerates the helper from `LISTING.md`, `REVIEWER-TESTS.md`, and the current release files, and includes it at the root of the submission kit.

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
3. Host the privacy policy, verify its public URL, and finish publisher account verification and Two-Step Verification.
4. In the dashboard, choose **Add new item** and upload the final ZIP. For an existing item, upload the new version to that item rather than making a duplicate listing.
5. Fill the Store listing tab with `LISTING.md`, upload the icon/screenshots/small promo tile, and choose the offered category closest to Developer Tools and English language. Add genuine support/homepage URLs if available.
6. Fill the Privacy tab: single purpose, `clipboardWrite`, `storage`, site-access explanations, remote-code declaration (**Yes**, with native page-service explanation), Website content, Web history/browsing activity, and Personally identifiable information data handling, and the hosted privacy-policy URL. Review the certifications against the final code.
7. Fill Distribution with your intended audience and regions. This extension is free and requires an Azure DevOps account/project that the user already has access to.
8. Fill private Test instructions using `REVIEWER-TESTS.md` and the dedicated account/project details. Avoid inaccessible or incomplete login instructions.
9. Review every tab and submit for review. To control the release timing, choose deferred/manual publishing if offered instead of publishing automatically after approval.
10. Monitor dashboard status and the verified contact inbox for review questions. Publish after approval when ready, then install the store build and repeat its essential copy/theme checks.

Google describes ZIP upload, dashboard tabs, and review/deferred publication in [Publish in the Chrome Web Store](https://developer.chrome.com/docs/webstore/publish). Dashboard labels and account requirements may change; follow the current dashboard when completing account-specific fields.

## Do not lose the release evidence

Record the uploaded ZIP's SHA-256, version, test results, browser version, known limitations, and final image names in the release handoff. This document does not assert that browser QA or release checks have passed; use the actual final report. Any fixes after packaging require rebuilding and validating the ZIP.
