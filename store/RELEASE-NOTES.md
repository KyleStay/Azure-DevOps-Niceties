# Azure DevOps Niceties 0.6.5

- Fix State controls being skipped by nested item metadata, hidden native editors, split headers, or panels shown after loading. The same state editor supports release item lists, Sprints → Backlog, and product backlogs.
- Release work-item lists now fill the overlay and fit narrow panels without horizontal scrolling. Copy icons appear first, followed by selection, State, and Title; Type stays available for filtering.
- Copy all backlog items, with or without bugs, using the project’s own categories. Supports Scrum PBIs, Agile user stories, Basic issues, CMMI requirements, and custom backlog types.
- Click an identifiable work-item State to choose and save a workflow state immediately. Saves respect Azure DevOps permissions, required fields, and revision checks.
- Turn inline state editing off independently in the extension menu. Existing copying, theme, and summary preferences remain supported.

State editing requires a readable state field and identifiable work item. Existing native editors and unsaved input remain untouched. Workflow errors and conflicts link back to the item; unconfirmed saves are never retried automatically.
