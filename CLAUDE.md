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

## UI Constraints

Keep the React UI simple: a list of notes and a form to create/edit one. Avoid adding navigation, themes, or rich-text editing unless explicitly requested.
