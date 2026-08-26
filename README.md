# Work Journal

A desktop-first personal work management app built with PocketBase + React + TypeScript.

## Stack

- PocketBase
- Vite
- React
- TypeScript
- Chakra UI v3
- TanStack Query
- React Router
- dnd-kit

## Repository layout

- root app — React + TypeScript frontend
- `pb_migrations/` — PocketBase schema migrations
- `pb_public/` — static frontend assets for production hosting
- `pb_data/` — local PocketBase SQLite data (ignored from version control)

## Current status

- frontend scaffolded and compiling
- app shell and protected route structure in place
- collection prefix set to `work_journal_`
- PocketBase backend schema and migration work is next

## Development

```bash
pnpm install
pnpm dev
```

## Production build

```bash
pnpm build
```

## Seed UI demo data

To quickly populate several projects and tasks for layout work:

```bash
PB_EMAIL=you@example.com PB_PASSWORD=your-password pnpm seed:ui
```

Optional variables:

- `PB_URL` (default: `http://127.0.0.1:8090`)

The script removes prior records created by the same seed (`UI Seed - ...` projects and `[seed-ui] ...` tasks) and recreates a fresh dataset.

## PocketBase collections

Custom collection names use the `work_journal_` prefix:

- `work_journal_projects`
- `work_journal_tasks`
- `work_journal_notes`
- `work_journal_daily_tasks`
