# Azure DevOps Niceties 0.6.8

- Rework release work-item lists with aligned, full-width columns, readable nested title text, compact copy controls, and a tighter toolbar. Native sort labels no longer hide Title or State. Narrow overlays hide the standalone ID column while copied references retain IDs.
- After a confirmed inline save, refresh a matching older item form through the native form service when it is available. Forms with unsaved edits stay untouched; synchronization does not save fields or reload the page.
- State text no longer reserves space for a dropdown arrow. Hover and keyboard focus reveal the control without shifting the row. State choices use the project’s process order when available, with a bounded metadata lookup and a fallback to definition order; valid-transition filtering remains in place.
- Fix State pickers missing from native sprint backlog rows whose work-item links end in a slash. The shared fix also covers matching links in queries, product backlogs, and release lists.
- Fix State controls being skipped by nested item metadata, hidden native editors, split headers, or panels shown after loading. The same state editor supports release item lists, Sprints → Backlog, and product backlogs.
- Release work-item lists now fill the overlay and fit narrow panels without horizontal scrolling. Copy icons appear first, followed by selection, State, and Title; Type stays available for filtering.
- Copy all backlog items, with or without bugs, using the project’s own categories. Supports Scrum PBIs, Agile user stories, Basic issues, CMMI requirements, and custom backlog types.
- Click an identifiable work-item State to choose and save a workflow state immediately. Saves respect Azure DevOps permissions, required fields, and revision checks.
- Turn inline state editing off independently in the extension menu. Existing copying, theme, and summary preferences remain supported.

State editing requires a readable state field and identifiable work item. Existing native editors and unsaved input remain untouched. Workflow errors and conflicts link back to the item; unconfirmed saves are never retried automatically.
