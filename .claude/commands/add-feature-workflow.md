---
description: CRITICAL — run this workflow for every feature implementation or refinement request without exception.
---

You are implementing or refining a feature in GreatNote. Follow every step below in order. Do not skip steps or proceed past a step that requires user approval.

## Step 1 — Confirm context

Run `git branch --show-current` and `pwd`. Report the active branch and working directory to the user before doing anything else.

## Step 2 — Understand the requirement

Restate the feature request in your own words: what it does, what success looks like, and any constraints or edge cases you can already foresee. Ask the user to confirm or correct your understanding before proceeding.

## Step 3 — Identify affected areas

Search the codebase and list every file likely to change, grouped by layer:

- **DB / migrations** — new models, fields, or schema changes
- **Backend** — `services.py` functions, serializers, views, URLs
- **Frontend** — components, hooks, service modules
- **Tests** — which test classes will need new or updated cases

Call out anything surprising (e.g. a migration that could be destructive, a service function shared by multiple views).

## Step 4 — Produce a plan and get approval

Write a numbered implementation plan. For each step include: what changes, in which file, and why. Present the plan and explicitly ask:

> "Does this plan look right? I will not start editing until you approve."

Wait for the user's explicit go-ahead. Incorporate any feedback before proceeding.

## Step 5 — Implement in layer order

Make changes in this sequence and do not move to the next layer until the current one is done:

1. **DB schema** — add or modify models, then generate and apply the migration (`python manage.py makemigrations && python manage.py migrate`).
2. **Backend** — update `services.py` first (business logic), then serializers, then views, then URLs. Follow the existing ownership convention: every service function takes `user` as its first argument and filters with `user=user` or `note__user=user`.
3. **Frontend** — update or add service modules in `src/services/` first, then hooks, then components. Follow the existing auto-save convention: use `useDebounce(value, 500)` for content edits and set `isSaving` around API calls.

## Step 6 — Update tests and verify behavior

- Add or update tests in `notes/tests.py` for every changed or new service function. Use Django's `TestCase` so the DB resets between cases.
- Run the full backend test suite: `cd backend && python manage.py test`
- If frontend logic changed, run: `cd frontend && npm test -- --watchAll=false`
- Report pass/fail. If anything fails, fix it before moving on.

## Step 7 — Summarize changes

Produce a concise summary with three sections:

**What changed** — bullet list of files modified and what each does differently now.

**How to verify manually** — the exact steps to exercise the new feature in a browser or via curl.

**Migration note** — whether a migration was added and whether it is safe to apply to an existing database (e.g. nullable vs. non-nullable new columns).
