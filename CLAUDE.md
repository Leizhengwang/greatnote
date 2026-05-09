# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**GreatNote** is a small personal notes app. The UI should stay minimal — no clutter, no feature creep. When in doubt, do less.

## Tech Stack

- **Frontend:** React (with functional components and hooks)
- **Backend:** Django + Django REST Framework

## Project Structure

```
greatnote/
├── frontend/          # React app
│   ├── src/
│   │   ├── components/
│   │   ├── services/  # API call wrappers
│   │   └── App.jsx
│   └── package.json
└── backend/           # Django project
    ├── notes/         # Main Django app
    │   ├── models.py
    │   ├── serializers.py
    │   ├── views.py
    │   ├── urls.py
    │   └── services.py   # Business logic lives here
    ├── manage.py
    └── requirements.txt
```

## Commands

### Backend

```bash
# Install dependencies
pip install -r backend/requirements.txt

# Run dev server
cd backend && python manage.py runserver

# Apply migrations
python manage.py migrate

# Run all tests
python manage.py test

# Run a single test
python manage.py test notes.tests.NoteServiceTests.test_create_note
```

### Frontend

```bash
# Install dependencies
cd frontend && npm install

# Run dev server
npm start

# Run tests
npm test

# Run a single test file
npm test -- --testPathPattern=NoteService
```

## Architecture Notes

### Backend service layer

Business logic belongs in `notes/services.py`, not in views. Views handle HTTP concerns (auth, serialization, response codes); services handle the actual logic (creating, updating, archiving notes). Tests cover the service layer, not the views.

### API contract

The Django backend exposes a REST API consumed by the React frontend. The frontend `src/services/` directory mirrors the backend endpoints — one module per resource (e.g., `noteService.js`).

### Testing focus

Write tests for `services.py`. View-level and serializer tests are lower priority. Use Django's `TestCase` for service tests so the database is reset between cases.

## Ownership conventions

Every note is scoped to a user. Enforce this at the service layer, not the view layer.

- All service functions accept `user` as their first argument and filter with `user=user` (notes) or `note__user=user` (pages).
- `Page` has no direct user FK. Ownership is enforced transitively through its parent `Note` — always look up the page via `Page.objects.get(pk=page_id, note__user=user)`.
- `Note.user` is `null=True` in the model only because of the initial migration. All new notes must be created with a user; never create a note without one.
- Views must always pass `request.user` into every service call — no direct ORM access from views.

## Auto-save conventions

Edits are saved automatically via debounce; there is no explicit "Save" button.

- Use `useDebounce(value, 500)` for all note content saves (title in `App.js`, page body in `NoteEditor.jsx`/`PageBlock`).
- Use `useDebounce(value, 300)` for search queries (shorter delay for responsiveness).
- Set `isSaving = true` before the API call and clear it in `.finally()`. This drives the "Saving…" indicator in `NoteEditor`.
- Guard auto-save effects so they only fire when the debounced value actually differs from the server state, avoiding spurious PATCH requests on mount.
- The shared `useDebounce` hook lives in `src/hooks/useDebounce.js`; import it from there rather than re-implementing per-component.

## UI Constraints

Keep the React UI simple: a list of notes and a form to create/edit one. Avoid adding navigation, themes, or rich-text editing unless explicitly requested.
