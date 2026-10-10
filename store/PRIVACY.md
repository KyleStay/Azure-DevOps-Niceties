# Azure DevOps Niceties privacy policy

Effective date: October 9, 2026

Azure DevOps Niceties improves work-item copying and follows your system's light or dark appearance on Azure DevOps. This policy describes the extension's handling of information.

## Information used

Enhanced copying is disabled until you review the disclosure in the extension's toolbar menu and turn on **Enable enhanced copying**. After you enable it, the extension reads Azure DevOps work-item information available in the page you are using, including work-item IDs, titles, types, and URLs. It uses this information to identify work-item copy controls and to format references when you request a copy. URLs identify your Azure DevOps organization or project and the work item being copied. You may withdraw this approval in the same menu.

When enhanced copying and **Include parent context** are enabled and you request a rich or Markdown copy, the extension requests the work item's relations and its parent's ID, title, type, and URL from the same Azure DevOps organization. Requests use your existing signed-in Azure DevOps session. The extension does not extract or store your passwords, authentication tokens, or session cookies.

The extension reads the browser's system color-scheme preference and uses Azure DevOps's native theme service to apply the corresponding light or dark theme. It preserves native high-contrast themes and forced-colors settings. Theme matching works independently of copying approval and does not process work-item content. It does not change your saved Azure DevOps account theme preference.

The extension stores two settings using `chrome.storage.sync`: whether to include parent context and your branch-name prefix. Chrome may synchronize these preferences through your Google account when Chrome sync is enabled. Your enhanced-copying approval is stored in `chrome.storage.local` on the current device and is not synchronized. Each device requires its own approval. Work-item information is not stored in Chrome local or sync storage.

## How information is used and shared

Work-item information is processed locally to provide the copy features. An explicit copy click or keyboard shortcut writes the formatted result to your system clipboard. The extension does not read the clipboard. Other applications, operating-system clipboard features, or clipboard managers may access or retain the copied information according to their own settings and policies. You choose where to paste it.

Optional parent requests send the work-item identifiers and existing browser session credentials to Azure DevOps over HTTPS so that Azure DevOps can authorize and return the requested data. Microsoft operates Azure DevOps. Applying native themes may also cause Azure DevOps to request its own theme data or site resources. The extension does not operate a separate server or send work-item information to its developer.

Google operates Chrome's preference synchronization. Microsoft and Google handle information under their respective policies: [Microsoft Privacy Statement](https://privacy.microsoft.com/privacystatement) and [Google Privacy Policy](https://policies.google.com/privacy).

The extension has no analytics, advertising, tracking service, or sale of user data. It uses handled information only to provide its stated Azure DevOps features. Its handling of user data complies with the Chrome Web Store User Data Policy, including its Limited Use requirements. It does not use or transfer information for personalized advertising or creditworthiness decisions. The developer does not receive work-item information for human review.

## Retention and controls

Work-item information is used in the open page. Parent details may be cached in that page's memory, with a 30-second freshness period; an expired entry may remain in memory until reused or the page is closed. These details are not written to persistent extension storage. Closing the Azure DevOps tab removes the extension's in-memory state for that page.

Copied data remains in the clipboard until replaced or cleared and may be retained longer by operating-system clipboard history or another application. The extension cannot delete copies you paste elsewhere.

Settings remain in Chrome storage until changed or removed. You can change them in the extension's toolbar menu or options page, withdraw enhanced-copying approval, turn off parent context, control Chrome sync using Chrome settings, disable the extension, or uninstall it. Chrome manages removal and any synchronized copies according to your profile and sync settings. The developer has no server-side user database to access or delete.

## Questions and policy changes

For privacy questions, contact the developer through the [project's support page](https://github.com/KyleStay/Azure-DevOps-Niceties/issues). Do not include private work-item content, organization URLs, passwords, or tokens in a public issue. You can also use the developer contact channel on the Chrome Web Store listing when available. This policy may be updated when the extension's behavior changes; the effective date above identifies this version.
