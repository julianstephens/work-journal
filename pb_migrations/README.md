# PocketBase migrations

The schema for v0.1 is intentionally simple and user-scoped.

## Custom collections

- `work_journal_projects`
- `work_journal_tasks`
- `work_journal_notes`
- `work_journal_daily_tasks`

## Required field rules

### work_journal_projects
- `user` relation -> users
- `name` text required
- `description` text optional
- `archived` bool required default false
- `position` number required default 0

### work_journal_tasks
- `user` relation -> users
- `project` relation -> work_journal_projects optional
- `parent` relation -> work_journal_tasks optional
- `title` text required
- `completed` bool required default false
- `position` number required default 0
- `completed_at` date optional

### work_journal_notes
- `user` relation -> users
- `project` relation -> work_journal_projects optional
- `task` relation -> work_journal_tasks optional
- `title` text required
- `body` text required

### work_journal_daily_tasks
- `user` relation -> users
- `date` date required
- `task` relation -> work_journal_tasks required
- `position` number required default 0
- unique index on `user + date + task`

## Auth and access rules

All custom collections should enforce:

```text
user = @request.auth.id
```

This keeps records isolated to the authenticated user and aligns with the future-growth requirement.

## Example PocketBase access rules

```text
@request.auth.id != ""
```

For each collection:

```text
@request.auth.id = user.id
```

and deny unauthenticated access to create/read/update/delete unless authenticated.
